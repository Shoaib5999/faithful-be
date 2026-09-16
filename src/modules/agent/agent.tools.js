const prisma = require('../../config/db');
const productService = require('../product/product.service');
const { searchProducts } = require('../search/search.service');
const cartService = require('../cart/cart.service');
const orderService = require('../order/order.service');
const categoryService = require('../category/category.service');

/**
 * Tool layer — the agent's only route to real data.
 *
 * Two rules govern everything here:
 *
 * 1. The model never states a price, stock level or order status from memory.
 *    Every such fact comes from one of these calls, against live services.
 * 2. Nothing here trusts the model for authorisation. The caller's identity is
 *    passed in as `context` and used server-side; the model cannot supply a user
 *    id, so it cannot read or mutate anyone else's cart or orders.
 */

const INR = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/**
 * Strip quantity and unit noise out of a search query.
 *
 * Customers say "add 1kg chicken curry cut", and the model passes that straight
 * through. Product names never contain the weight, so a literal match finds
 * nothing and the agent wrongly reports the item as unavailable. Sizes live on
 * variants, so they are not search terms at all — drop them.
 */
const SIZE_NOISE = /\b\d+(?:\.\d+)?\s*(?:kg|kgs|kilo|kilos|kilogram|kilograms|g|gm|gms|gram|grams|pc|pcs|piece|pieces|pack|packs)\b/gi;
const FILLER_WORDS = /\b(?:add|please|want|need|buy|order|get|me|my|a|an|the|of|to|cart|some)\b/gi;

const cleanSearchQuery = (raw) => {
    if (!raw) return undefined;
    const cleaned = String(raw)
        .replace(SIZE_NOISE, ' ')
        .replace(FILLER_WORDS, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    // If stripping removed everything, fall back to the original rather than
    // searching for an empty string.
    return cleaned || String(raw).trim();
};

/** Trim a product to what the model actually needs, to keep prompts small. */
const summariseProduct = (product) => {
    const variants = (product.variants || [])
        .filter((v) => v.isActive !== false)
        .map((v) => ({
            variantId: v.id,
            label: v.unit?.symbol ? `${v.weightGrams}${v.unit.symbol}` : `${v.weightGrams}g`,
            price: Number(v.price),
            inStock: (v.stockQty ?? 0) > 0,
        }));

    return {
        slug: product.slug,
        name: product.name,
        // Used by the storefront to render a real product card in the chat —
        // not read by the model itself, but harmless (small) to include in
        // its context either way.
        image: product.images?.[0]?.url || null,
        category: product.category?.name || null,
        priceFrom: variants.length ? Math.min(...variants.map((v) => v.price)) : null,
        variants,
        // Descriptions can be long; the model rarely needs more than a gist.
        description: product.description ? String(product.description).slice(0, 300) : null,
    };
};

const tools = {
    /** Search the live catalogue. */
    search_products: {
        definition: {
            type: 'function',
            function: {
                name: 'search_products',
                description:
                    'Search the store catalogue for products. Use this whenever the customer asks what is available, or mentions a product, cut, category or budget. Always use this instead of recalling products from memory.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description:
                                'Product name terms only, e.g. "chicken curry cut". Never include a weight, size or quantity here (no "1kg", no "500g") — sizes are variants on the product, not part of its name. Search the name, then pick the size from the result.',
                        },
                        categorySlug: {
                            type: 'string',
                            description: 'Restrict to a category slug, from get_categories.',
                        },
                        maxPrice: { type: 'number', description: 'Maximum price in rupees.' },
                        minPrice: { type: 'number', description: 'Minimum price in rupees.' },
                    },
                },
            },
        },
        handler: async ({ query, categorySlug, maxPrice, minPrice }) => {
            // Uses the store's real search endpoint (Postgres full-text search),
            // not a plain substring match. That matters for exactly the kind of
            // query this tool gets a lot of: multi-word and in whatever order the
            // customer said it. A literal-substring match is order-sensitive —
            // "chicken boneless" would not match a product named "Chicken Breast
            // Boneless" — while full-text search matches on the words present,
            // in any order, and ranks the best match first.
            const result = await searchProducts({
                q: cleanSearchQuery(query),
                categorySlug: categorySlug || undefined,
                minPrice: minPrice != null ? Number(minPrice) : undefined,
                maxPrice: maxPrice != null ? Number(maxPrice) : undefined,
                limit: 8, // Enough to choose from, small enough to stay cheap.
                page: 1,
            });

            const products = (result?.products || []).map(summariseProduct);
            return {
                count: products.length,
                products,
                note: products.length === 0 ? 'No matching products are currently available.' : undefined,
            };
        },
    },

    get_product_details: {
        definition: {
            type: 'function',
            function: {
                name: 'get_product_details',
                description:
                    'Get full live details for one product by its slug, including every size/weight variant with its real current price and stock.',
                parameters: {
                    type: 'object',
                    properties: {
                        slug: { type: 'string', description: 'Product slug from search_products.' },
                    },
                    required: ['slug'],
                },
            },
        },
        handler: async ({ slug }) => {
            const product = await productService.getProductBySlug(slug);
            if (!product) return { found: false, message: `No product exists with slug "${slug}".` };
            return { found: true, product: summariseProduct(product) };
        },
    },

    get_categories: {
        definition: {
            type: 'function',
            function: {
                name: 'get_categories',
                description: 'List the store\'s product categories, for browsing or narrowing a search.',
                parameters: { type: 'object', properties: {} },
            },
        },
        handler: async () => {
            const categories = await categoryService.getAllCategories();
            return {
                categories: (categories || [])
                    .filter((c) => c.isActive !== false)
                    .map((c) => ({ name: c.name, slug: c.slug })),
            };
        },
    },

    get_cart: {
        definition: {
            type: 'function',
            function: {
                name: 'get_cart',
                description:
                    "Read the customer's current cart, with real line items and totals. Use before answering any question about what they have already chosen.",
                parameters: { type: 'object', properties: {} },
            },
        },
        handler: async (_args, context) => {
            if (!context.userId) {
                // Guests keep their cart client-side; there is nothing to read
                // server-side, and saying so is better than implying it's empty.
                return {
                    signedIn: false,
                    message:
                        'The customer is not signed in, so their cart is only on their device. Ask them what they have in it, or invite them to sign in.',
                };
            }
            const summary = await cartService.getCartSummary(context.userId);
            const items = summary?.cart?.items || [];
            return {
                signedIn: true,
                itemCount: items.length,
                // Both prices are named explicitly and pre-formatted. An earlier
                // version returned only "lineTotal", which the model read as a
                // unit price and then multiplied again — reporting double the
                // real amount to the customer.
                items: items.map((i) => ({
                    itemId: i.id,
                    name: i.variant?.product?.name || 'Item',
                    size: i.variant?.weightGrams ? `${i.variant.weightGrams}g` : null,
                    quantity: i.quantity,
                    pricePerUnit: INR(Number(i.variant?.price || 0)),
                    lineTotalForAllUnits: INR(Number(i.variant?.price || 0) * i.quantity),
                })),
                // Cart totals arrive pre-formatted as fixed-decimal strings.
                subtotal: summary?.subtotal != null ? INR(summary.subtotal) : null,
                total: summary?.total != null ? INR(summary.total) : null,
            };
        },
    },

    add_to_cart: {
        definition: {
            type: 'function',
            function: {
                name: 'add_to_cart',
                description:
                    'Add a specific product variant to the cart. Only call this after the customer has clearly agreed to add that item. Never guess a variantId — take it from search_products or get_product_details.',
                parameters: {
                    type: 'object',
                    properties: {
                        variantId: { type: 'string', description: 'Exact variant id from a prior tool result.' },
                        quantity: { type: 'number', description: 'How many to add. Defaults to 1.' },
                    },
                    required: ['variantId'],
                },
            },
        },
        handler: async ({ variantId, quantity }, context) => {
            const qty = Math.max(1, Math.min(Number(quantity) || 1, 20));

            if (!context.userId) {
                // Guest carts live in the browser. Rather than pretend to have
                // added it, hand the client a proposal it can apply locally —
                // the widget surfaces this as a one-tap confirm. The proposal
                // carries the display fields a cart line needs, since the
                // browser cannot look them up from a variant id alone.
                const variant = await prisma.productVariant.findUnique({
                    where: { id: variantId },
                    include: {
                        unit: { select: { symbol: true } },
                        product: {
                            select: {
                                name: true,
                                category: { select: { slug: true } },
                                images: {
                                    where: { isPrimary: true },
                                    select: { url: true },
                                    take: 1,
                                },
                            },
                        },
                    },
                });

                if (!variant || !variant.isActive) {
                    return { added: false, error: 'That item is no longer available.' };
                }
                if ((variant.stockQty ?? 0) < qty) {
                    return { added: false, error: 'There is not enough stock for that quantity.' };
                }

                const unitLabel = variant.unit?.symbol || 'g';
                return {
                    added: false,
                    requiresClientAction: true,
                    proposal: {
                        variantId,
                        quantity: qty,
                        name: variant.product?.name || 'Item',
                        image: variant.product?.images?.[0]?.url || '',
                        price: INR(variant.price),
                        priceNumber: Number(variant.price),
                        notes: `${variant.weightGrams}${unitLabel}`,
                        categorySlug: variant.product?.category?.slug || undefined,
                        stockQty: variant.stockQty ?? undefined,
                    },
                    message:
                        'The customer is not signed in. Tell them you have prepared the item and they can confirm adding it, or sign in to save their cart.',
                };
            }

            try {
                await cartService.addToCart(context.userId, { variantId, quantity: qty });
            } catch (err) {
                // Out of stock / invalid variant are normal outcomes, not crashes.
                return { added: false, error: err.message || 'Could not add that item to the cart.' };
            }

            const summary = await cartService.getCartSummary(context.userId);
            return {
                added: true,
                quantity: qty,
                cartItemCount: summary?.cart?.items?.length || 0,
                cartTotal: summary?.total != null ? INR(summary.total) : null,
            };
        },
    },

    track_order: {
        definition: {
            type: 'function',
            function: {
                name: 'track_order',
                description:
                    "Look up the real status of an order by its order number. Use whenever the customer asks where their order is.",
                parameters: {
                    type: 'object',
                    properties: {
                        orderNumber: { type: 'string', description: 'The order number or id the customer gives.' },
                    },
                    required: ['orderNumber'],
                },
            },
        },
        handler: async ({ orderNumber }, context) => {
            try {
                const order = await orderService.trackOrderPublic(String(orderNumber).trim());
                if (!order) return { found: false, message: 'No order found with that number.' };

                // Only reveal an order to the person who placed it. The public
                // tracking endpoint is reference-number based; without a signed-in
                // match we return status only, never address or contact details.
                const isOwner = context.userId && order.userId === context.userId;
                return {
                    found: true,
                    orderNumber: order.orderNumber || order.id,
                    status: order.status?.name || order.statusName || order.status || 'Processing',
                    placedAt: order.createdAt,
                    total: order.totalAmount != null ? INR(order.totalAmount) : null,
                    itemCount: order.items?.length ?? null,
                    ...(isOwner ? { deliveryEta: order.estimatedDelivery || null } : {}),
                };
            } catch (err) {
                return { found: false, message: 'Could not look up that order right now.' };
            }
        },
    },
};

/** Tool schemas sent to the model. */
const getToolDefinitions = () => Object.values(tools).map((t) => t.definition);

/**
 * Execute one tool call. Failures are returned to the model as data, not thrown:
 * a tool erroring should let the agent explain and recover, not kill the turn.
 */
const executeTool = async (name, rawArgs, context) => {
    const tool = tools[name];
    if (!tool) return { error: `Unknown tool "${name}".` };

    let args = {};
    if (rawArgs) {
        try {
            args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
        } catch {
            return { error: 'Tool arguments were not valid JSON.' };
        }
    }

    try {
        return await tool.handler(args, context);
    } catch (err) {
        return { error: err.message || 'That action failed.' };
    }
};

module.exports = { getToolDefinitions, executeTool, tools };
