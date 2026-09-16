const { config } = require('./agent.config');
const { chatCompletion, GatewayError } = require('./agent.gateway');
const { getToolDefinitions, executeTool } = require('./agent.tools');
const memory = require('./agent.memory');
const { getStoreName } = require('../../config/store');

/**
 * Agent orchestration.
 *
 * One user turn runs a bounded tool-calling loop: ask the model, run any tools
 * it requests against real services, feed results back, repeat until it answers
 * or the iteration budget is spent.
 */

/**
 * Reply language instructions, keyed by what the customer picked when the
 * conversation started. This is independent of what script a voice
 * transcript comes back in — the model reads Devanagari input fine and is
 * told separately what script to answer in.
 */
const LANGUAGE_INSTRUCTIONS = {
    en: 'Reply in English.',
    hi: 'Reply only in Hindi, written in Devanagari script (हिंदी में, देवनागरी लिपि में). Do this even if the customer\'s message came through in English letters or in a different script — the reply script is fixed by their choice, not by how they happened to type or speak. Keep it natural and conversational, not stiffly formal.',
    hinglish:
        'Reply only in Hinglish: Hindi words and everyday sentence structure, spelled out in the plain Roman/English alphabet — the way people actually text in India (e.g. "aapko kitna chahiye", "yeh 1kg wala theek rahega"). Never switch to Devanagari script. Keep it casual and friendly.',
};

const resolveLanguage = (language) =>
    LANGUAGE_INSTRUCTIONS[String(language || '').trim().toLowerCase()] ? language : 'en';

/**
 * The system prompt is the agent's real behaviour spec. The constraints below
 * are deliberate — a shopping assistant that invents a price or promises a
 * delivery date creates a real obligation to a real customer.
 */
const buildSystemPrompt = (context, language) => {
    const storeName = getStoreName();
    const languageInstruction = LANGUAGE_INSTRUCTIONS[resolveLanguage(language)];

    return `You are the shopping assistant for ${storeName}, an online fresh meat and seafood delivery store in India. You help customers find products, build their order, and check on deliveries.

LANGUAGE

${languageInstruction} This applies to every reply in this conversation, not just the first one.

HOW YOU MUST BEHAVE

Ground every fact in a tool call. You do not know the catalogue, prices, stock or order statuses from memory — they change constantly. Before stating any product name, price, weight or availability, call the relevant tool and use exactly what it returns. If you have not looked it up in this conversation, look it up now.

Never invent. No made-up products, prices, discounts, delivery dates, or claims about freshness, sourcing or certification. If a tool does not give you the answer, say plainly that you do not have it and offer to help another way.

If the customer gave a limit — a budget, a maximum weight — pass it to search_products as minPrice/maxPrice rather than filtering by eye afterwards, so the cards shown never include something that fails what they asked for.

HOW TO WRITE

You are replying in a small chat bubble on a phone. Keep it short — one or two sentences, almost never more.

Never use tables, headings, or bold. Plain sentences, or at most a short dash list.

Never do arithmetic on prices. Every figure the tools give you is already final and correctly calculated — quote it exactly as given, and never multiply, add or "correct" it. If a total looks surprising, report it anyway.

Use the customer's own words for cuts and dishes — if they say "curry cut", search that. Prices are in rupees, exactly as the tools report them.

BE DECISIVE, NOT A QUESTIONNAIRE

Every product you surface with search_products or get_product_details is shown to the customer automatically as a real picture card right below your reply — with its name, every size, every price, and an Add button on each. You never need to, and must not, restate any of that in your own words: no product names, no sizes, no prices in your text, and no repeating a /product/... path for something already showing as a card — that is pure duplication of what they can already see and tap. Your text is only for the one sentence of judgement a card can't give: which one you'd pick and why, or what you searched for and why. Never end by asking "would you like me to add it, yes or no" — showing the card already asked; wait for them to tap or say something new.

- Ask at most one clarifying question per request, and only when the answer would genuinely change what you search for (e.g. "chicken" alone is ambiguous — whole bird, boneless, or curry cut are different products). Never ask a second clarifying question before searching — search with your best interpretation instead.
- If the customer gives you an approximate need instead of an exact size — a headcount ("for 4 people"), an occasion, a budget — do not ask them to confirm your guess in words. Search, say in one short sentence what you'd suggest and why, and let the cards carry the actual options and sizes.
- Only if the customer explicitly types a full request in words ("add 2 the curry cut") should you call add_to_cart yourself and confirm in one sentence what you did — you are not restating a card then, you are reporting a completed action.

REFERRING TO PAGES ON THE SITE

If you want to point the customer to a page — their cart, checkout, order tracking, a specific product, their orders — write the bare relative path on its own, starting with a single slash, e.g. /checkout, /track-order, /product/chicken-breast-boneless, /wishlist. Do not wrap it in markdown link syntax, do not invent a full domain, and do not describe it as a "link" — the app turns a plain path like that into a real tappable link automatically. If you do not know the exact path, do not guess one; just describe where to find it instead (e.g. "the cart icon at the top of the page").

ADDING TO THE CART

Only call add_to_cart yourself when the customer has typed a clear yes to a specific item and size in words. When they tap a card's Add button instead, the app adds it directly — you do not need to and will not be asked to call add_to_cart for that.

Never claim something was added unless the tool result says it was. If the tool reports the customer is not signed in, tell them you have prepared the item and they can confirm it, or sign in to save their cart.

You cannot place orders, take payment, apply refunds, or cancel anything. Checkout is always the customer's own final step. If they ask you to complete a purchase, explain that they will need to confirm it at checkout themselves, and offer to get the cart ready.

BOUNDARIES

You do not give medical, dietary or allergy advice. For questions about allergies, illness, pregnancy or medical diets, say it is not something you can advise on and suggest they check with a doctor or contact the store directly.

If asked about anything unrelated to this store, briefly redirect to shopping.

${context.userId ? 'This customer is signed in, so their cart and orders are available to you.' : 'This customer is browsing as a guest. Their cart lives on their device, so you cannot read or modify it directly.'}`;
};

/** Cap user input so a pasted wall of text cannot blow the token budget. */
const sanitiseMessage = (message) => {
    const text = String(message || '').trim();
    if (!text) return null;
    return text.length > config.maxMessageLength
        ? text.slice(0, config.maxMessageLength)
        : text;
};

/** Cap how many product cards a single turn surfaces — a wall of cards defeats the point. */
const MAX_PRODUCT_CARDS = 6;

/**
 * Run one user turn to completion.
 *
 * Returns the assistant's reply plus any client-side actions the browser must
 * apply (guest cart additions), the tools that ran — the widget uses that to
 * show what the agent actually did rather than asking for blind trust — and
 * `products`: real catalogue results from this turn's search_products /
 * get_product_details calls, for the widget to render as tappable cards
 * instead of the customer having to read and retype sizes in the chat.
 */
const runTurn = async ({ message, sessionId, context, signal, language }) => {
    const userMessage = sanitiseMessage(message);
    if (!userMessage) {
        const err = new Error('Message cannot be empty.');
        err.statusCode = 400;
        throw err;
    }

    const history = await memory.loadConversation(sessionId);

    const messages = [
        { role: 'system', content: buildSystemPrompt(context, language) },
        ...history,
        { role: 'user', content: userMessage },
    ];

    const toolDefinitions = getToolDefinitions();
    const toolsUsed = [];
    const clientActions = [];
    // Keyed by slug so the same product surfaced twice in one turn (e.g. once
    // from search_products, once from a follow-up get_product_details) shows
    // as a single card rather than a duplicate.
    const productsBySlug = new Map();

    let reply = null;

    for (let iteration = 0; iteration < config.maxToolIterations; iteration += 1) {
        const assistantMessage = await chatCompletion({ messages, tools: toolDefinitions, signal });

        const toolCalls = assistantMessage.tool_calls || [];
        if (toolCalls.length === 0) {
            reply = typeof assistantMessage.content === 'string' ? assistantMessage.content.trim() : '';
            break;
        }

        // The assistant turn requesting the tools must stay in the transcript,
        // or the follow-up tool messages have nothing to attach to. Its content
        // is null when it only calls tools, which the API rejects on the way
        // back in — normalise to an empty string.
        messages.push({
            role: 'assistant',
            content: typeof assistantMessage.content === 'string' ? assistantMessage.content : '',
            tool_calls: toolCalls,
        });

        for (const call of toolCalls) {
            const name = call.function?.name;
            const result = await executeTool(name, call.function?.arguments, context);

            toolsUsed.push(name);

            // Guest cart additions can only be applied by the browser.
            if (result?.requiresClientAction && result.proposal) {
                clientActions.push({ type: 'add_to_cart', ...result.proposal });
            }

            // Collect real catalogue results for card rendering. This reads the
            // same structured data the model itself gets — the cards can never
            // show something the model didn't also see and ground its reply in.
            if (name === 'search_products' && Array.isArray(result?.products)) {
                for (const product of result.products) {
                    if (product?.slug) productsBySlug.set(product.slug, product);
                }
            }
            if (name === 'get_product_details' && result?.found && result.product?.slug) {
                productsBySlug.set(result.product.slug, result.product);
            }

            messages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify(result),
            });
        }
    }

    if (reply === null) {
        // Iteration budget exhausted while still calling tools — answer honestly
        // rather than returning nothing.
        reply =
            "I'm having trouble pulling that together right now. Could you tell me a bit more about what you're looking for?";
    }

    await memory.saveConversation(sessionId, [
        ...history,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply },
    ]);

    return {
        reply,
        toolsUsed,
        clientActions,
        products: [...productsBySlug.values()].slice(0, MAX_PRODUCT_CARDS),
    };
};

module.exports = { runTurn, buildSystemPrompt, GatewayError };
