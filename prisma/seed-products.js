/**
 * Seed catalog — Chicken, Mutton, Fish, Seafood, Ready to Cook, Eggs & Combo Packs
 *
 * Prerequisites:
 *   - Postgres running + migrations applied
 *   - Master data: npm run seed:master
 *   - Cut types: npm run seed:cut-types
 *   - R2 env vars set in .env
 *
 * Run: npm run seed:products
 *
 * Product photography: each product gets its category's stock photo
 * (uploaded to R2 under categories/<slug>.jpg) as a placeholder image,
 * since we don't have per-product photography yet. Replace with real
 * per-product photos via the admin upload UI whenever available.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');
const slugify = require('../src/utils/slugify');
const { normalizeSKU } = require('../src/utils/variant-sku');
const { CATALOG_DETAILS } = require('./product-catalog-details');

const prisma = new PrismaClient();

/** Category placeholder photos already uploaded to R2 under categories/<slug>.jpg. */
const CATEGORY_IMAGE_KEYS = {
  chicken: 'categories/chicken.jpg',
  mutton: 'categories/mutton.jpg',
  fish: 'categories/fish.jpg',
  seafood: 'categories/seafood.jpg',
  'ready-to-cook': 'categories/ready-to-cook.jpg',
  eggs: 'categories/eggs.jpg',
  'combo-packs': 'categories/combo-packs.jpg',
};

// Storefront collection badges (stored as badge:<slug> in product tags)
const BADGE = {
  BEST_SELLERS: 'best-sellers',
  NEW_ARRIVALS: 'new-arrivals',
};

// ─── Pricing helpers ────────────────────────────────────────────────────────

/** Round to the nearest ₹5, matching how the shop prices weighed cuts. */
const round5 = (n) => Math.round(n / 5) * 5;

/** Scale a 1kg reference price down/up to each weight (grams), rounded to ₹5. */
const scaleVariants = (kgPrice, gramsList) =>
  gramsList.map((weightGrams) => ({
    weightGrams,
    price: round5((kgPrice * weightGrams) / 1000),
  }));

// ─── CHICKEN ────────────────────────────────────────────────────────────────

const CHICKEN_PRODUCTS = [
  { name: 'Chicken Curry Cut', badge: BADGE.BEST_SELLERS, variants: scaleVariants(220, [250, 500, 1000, 2000]) },
  { name: 'Chicken Breast Boneless', variants: scaleVariants(270, [250, 500, 1000, 2000]) },
  { name: 'Whole Chicken (Skinless)', variants: scaleVariants(210, [500, 1000, 2000]) },
];

// ─── MUTTON ─────────────────────────────────────────────────────────────────

const MUTTON_PRODUCTS = [
  { name: 'Mutton Boneless', variants: scaleVariants(820, [250, 500, 1000]) },
  { name: 'Mutton Curry Cut', badge: BADGE.BEST_SELLERS, variants: scaleVariants(560, [250, 500, 1000]) },
  { name: 'Mutton Keema', variants: scaleVariants(480, [250, 500, 1000]) },
  { name: 'Mutton Seekh Cut', variants: scaleVariants(600, [250, 500, 1000]) },
];

// ─── FISH ───────────────────────────────────────────────────────────────────

const FISH_PRODUCTS = [
  { name: 'Fresh Rohu Fish', variants: scaleVariants(360, [500, 1000, 2000]) },
  { name: 'Fish Steak Cut (Surmai)', variants: scaleVariants(650, [250, 500, 1000]) },
];

// ─── SEAFOOD ────────────────────────────────────────────────────────────────

const SEAFOOD_PRODUCTS = [
  { name: 'Prawns (Medium)', badge: BADGE.BEST_SELLERS, variants: scaleVariants(550, [250, 500, 1000]) },
  { name: 'Tiger Prawns (Large)', variants: scaleVariants(750, [250, 500, 1000]) },
];

// ─── READY TO COOK ──────────────────────────────────────────────────────────

const READY_TO_COOK_PRODUCTS = [
  { name: 'Chicken Seekh Kebab Mix', variants: scaleVariants(380, [250, 500, 1000]) },
  { name: 'Chicken Curry Marinated', badge: BADGE.NEW_ARRIVALS, variants: scaleVariants(260, [250, 500, 1000]) },
];

// ─── EGGS (flat single-variant pricing, not scaled from a kg reference) ─────

const EGGS_PRODUCTS = [
  { name: 'Farm Fresh Eggs (6 Pcs Tray)', variants: [{ weightGrams: 300, price: 60 }] },
  { name: 'Farm Fresh Eggs (12 Pcs Tray)', variants: [{ weightGrams: 600, price: 115 }] },
  { name: 'Farm Fresh Eggs (30 Pcs Tray)', variants: [{ weightGrams: 1500, price: 270 }] },
];

// ─── COMBO PACKS (flat single-variant pricing) ──────────────────────────────

const COMBO_PRODUCTS = [
  {
    name: 'Weekly Non-Veg Combo (Chicken + Mutton + Fish)',
    slug: 'weekly-non-veg-combo',
    badge: BADGE.NEW_ARRIVALS,
    variants: [{ weightGrams: 3000, price: 1450 }],
  },
  {
    name: 'Family BBQ Combo Pack',
    badge: BADGE.NEW_ARRIVALS,
    variants: [{ weightGrams: 2000, price: 950 }],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic 40–80 placeholder stock quantity, derived from the SKU. */
const stockQtyForSku = (sku) => {
  let hash = 0;
  for (let i = 0; i < sku.length; i += 1) {
    hash = (hash * 31 + sku.charCodeAt(i)) >>> 0;
  }
  return 40 + (hash % 41);
};

const buildTags = ({ tagType, cutType, badge = null, highlightTags = [] }) => {
  const parts = [`type:${tagType}`, tagType];
  if (cutType) parts.push(`cut:${cutType}`);

  if (badge) parts.push(`badge:${badge}`);

  highlightTags.forEach((tag) => {
    const t = String(tag).trim();
    if (t) parts.push(t);
  });

  return parts.join(',');
};

const resolveCatalogDetails = (slug) => {
  const details = CATALOG_DETAILS[slug];
  if (!details) {
    throw new Error(`Missing catalog details for slug "${slug}". Add an entry to product-catalog-details.js.`);
  }
  if (!details.description || !details.storefrontMeta) {
    throw new Error(`Incomplete catalog details for slug "${slug}".`);
  }
  return details;
};

const buildVariantDefs = (slug, variants) =>
  variants.map(({ weightGrams, price }) => {
    const sku = normalizeSKU(`FTM-${slug.replace(/-/g, '').toUpperCase()}-${weightGrams}G`);
    return {
      weightGrams,
      price,
      compareAtPrice: null,
      stockQty: stockQtyForSku(sku),
      sku,
    };
  });

const syncVariants = async (productId, variantDefs) => {
  for (const v of variantDefs) {
    const existing = await prisma.productVariant.findUnique({ where: { sku: v.sku } });

    if (existing) {
      if (existing.productId !== productId) {
        throw new Error(`SKU ${v.sku} already belongs to another product (${existing.productId})`);
      }
      await prisma.productVariant.update({
        where: { id: existing.id },
        data: {
          weightGrams: v.weightGrams,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          stockQty: v.stockQty,
          isActive: true,
        },
      });
      continue;
    }

    await prisma.productVariant.create({
      data: {
        productId,
        weightGrams: v.weightGrams,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        stockQty: v.stockQty,
        sku: v.sku,
        isActive: true,
      },
    });
  }

  const keepSkus = variantDefs.map((v) => v.sku);
  await prisma.productVariant.updateMany({
    where: { productId, sku: { notIn: keepSkus } },
    data: { isActive: false },
  });
};

/** Assign (or refresh) the product's primary image from its category's placeholder photo. */
const ensureCategoryImage = async (productId, tagType) => {
  const key = CATEGORY_IMAGE_KEYS[tagType];
  if (!key) return;

  const publicBase = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  if (!publicBase) return;
  const url = `${publicBase}/${key}`;

  const existing = await prisma.productImage.findFirst({
    where: { productId, isPrimary: true },
  });

  if (existing) {
    if (existing.url !== url || existing.cloudinaryId !== key) {
      await prisma.productImage.update({
        where: { id: existing.id },
        data: { cloudinaryId: key, url },
      });
    }
    return;
  }

  await prisma.productImage.create({
    data: {
      productId,
      cloudinaryId: key,
      url,
      isPrimary: true,
      sortOrder: 0,
    },
  });
};

const upsertProduct = async ({
  name,
  slug,
  categoryId,
  brandId,
  taxClassId,
  tags,
  storefrontMeta,
  description,
  variantDefs,
  tagType,
  sortOrder = 0,
}) => {
  let product = await prisma.product.findUnique({
    where: { slug },
    include: { images: true, variants: true },
  });

  const payload = {
    name,
    description,
    categoryId,
    brandId,
    taxClassId,
    tags,
    storefrontMeta,
    isActive: true,
    sortOrder,
  };

  if (product) {
    product = await prisma.product.update({
      where: { id: product.id },
      data: payload,
      include: { images: true, variants: true },
    });
    console.log(`  ↻  Updated : ${name}`);
  } else {
    product = await prisma.product.create({
      data: { slug, ...payload },
      include: { images: true, variants: true },
    });
    console.log(`  ✅ Created : ${name}`);
  }

  await syncVariants(product.id, variantDefs);
  await ensureCategoryImage(product.id, tagType);

  return product;
};

const getCategoryBySlug = async (slug) => {
  const category = await prisma.category.findFirst({
    where: { slug, parentId: null },
  });
  if (!category) {
    throw new Error(`Category "${slug}" not found. Run npm run seed:master first.`);
  }
  return category;
};

const ensureDefaultTaxClass = async () =>
  (await prisma.taxClass.findFirst({ where: { isDefault: true } })) ||
  (await prisma.taxClass.findFirst({ where: { name: 'Exempt (Fresh Meat)' } })) ||
  prisma.taxClass.create({
    data: { name: 'Exempt (Fresh Meat)', rate: 0, isDefault: true, isActive: true },
  });

const ensureFaithfulMeatBrand = async () =>
  prisma.brand.upsert({
    where: { slug: 'faithful-meat' },
    update: { name: 'Faithful Meat', isActive: true, isFeatured: true },
    create: {
      name: 'Faithful Meat',
      slug: 'faithful-meat',
      isActive: true,
      isFeatured: true,
      sortOrder: 1,
    },
  });

const productSlug = (def) => def.slug || slugify(def.name);

const collectSeedSlugs = () => [
  ...CHICKEN_PRODUCTS.map(productSlug),
  ...MUTTON_PRODUCTS.map(productSlug),
  ...FISH_PRODUCTS.map(productSlug),
  ...SEAFOOD_PRODUCTS.map(productSlug),
  ...READY_TO_COOK_PRODUCTS.map(productSlug),
  ...EGGS_PRODUCTS.map(productSlug),
  ...COMBO_PRODUCTS.map(productSlug),
];

const archiveLegacyProducts = async (keepSlugs) => {
  const legacy = await prisma.product.findMany({
    where: { slug: { notIn: keepSlugs } },
    select: { id: true, slug: true, name: true },
  });

  if (!legacy.length) {
    console.log('  No legacy products to archive.\n');
    return 0;
  }

  console.log(`\n🗑  Archiving ${legacy.length} product(s) not in current seed...\n`);

  for (const product of legacy) {
    await prisma.productVariant.updateMany({
      where: { productId: product.id },
      data: { isActive: false },
    });
    await prisma.product.update({
      where: { id: product.id },
      data: { isActive: false },
    });
    console.log(`  ✕  Archived : ${product.name} (${product.slug})`);
  }

  return legacy.length;
};

const assertCatalogCoverage = () => {
  const seedSlugs = collectSeedSlugs();
  const missing = seedSlugs.filter((slug) => !CATALOG_DETAILS[slug]);
  if (missing.length) {
    throw new Error(`Missing catalog details for: ${missing.join(', ')}`);
  }

  const extra = Object.keys(CATALOG_DETAILS).filter((slug) => !seedSlugs.includes(slug));
  if (extra.length) {
    throw new Error(`Orphan catalog details (no seed product): ${extra.join(', ')}`);
  }
};

const seedProductGroup = async ({
  defs,
  categoryId,
  brandId,
  taxClassId,
  tagType,
}) => {
  let created = 0;
  let updated = 0;

  for (let index = 0; index < defs.length; index += 1) {
    const def = defs[index];
    const slug = productSlug(def);
    const catalog = resolveCatalogDetails(slug);
    const before = await prisma.product.findUnique({ where: { slug } });

    await upsertProduct({
      slug,
      name: def.name,
      categoryId,
      brandId,
      taxClassId: taxClassId.id,
      tags: buildTags({
        tagType,
        cutType: catalog.cutType,
        badge: def.badge ?? null,
        highlightTags: def.highlightTags ?? [],
      }),
      storefrontMeta: catalog.storefrontMeta,
      description: catalog.description,
      variantDefs: buildVariantDefs(slug, def.variants),
      tagType,
      sortOrder: index + 1,
    });

    before ? updated++ : created++;
  }

  return { created, updated };
};

async function main() {
  console.log('🥩 Seeding Chicken, Mutton, Fish, Seafood, Ready to Cook, Eggs & Combo Packs...\n');

  assertCatalogCoverage();

  const seedSlugs = collectSeedSlugs();
  await archiveLegacyProducts(seedSlugs);

  const [taxClass, brand, catChicken, catMutton, catFish, catSeafood, catReadyToCook, catEggs, catCombo] =
    await Promise.all([
      ensureDefaultTaxClass(),
      ensureFaithfulMeatBrand(),
      getCategoryBySlug('chicken'),
      getCategoryBySlug('mutton'),
      getCategoryBySlug('fish'),
      getCategoryBySlug('seafood'),
      getCategoryBySlug('ready-to-cook'),
      getCategoryBySlug('eggs'),
      getCategoryBySlug('combo-packs'),
    ]);

  console.log(`  Brand       : ${brand.name}`);
  console.log(`  Tax class   : ${taxClass.name}`);
  console.log(
    `  Categories  : ${catChicken.name} | ${catMutton.name} | ${catFish.name} | ${catSeafood.name} | ${catReadyToCook.name} | ${catEggs.name} | ${catCombo.name}\n`,
  );

  console.log('── CHICKEN ─────────────────────────────────────────');
  const chickenStats = await seedProductGroup({
    defs: CHICKEN_PRODUCTS,
    categoryId: catChicken.id,
    brandId: brand.id,
    taxClassId: taxClass,
    tagType: 'chicken',
  });

  console.log('\n── MUTTON ──────────────────────────────────────────');
  const muttonStats = await seedProductGroup({
    defs: MUTTON_PRODUCTS,
    categoryId: catMutton.id,
    brandId: brand.id,
    taxClassId: taxClass,
    tagType: 'mutton',
  });

  console.log('\n── FISH ────────────────────────────────────────────');
  const fishStats = await seedProductGroup({
    defs: FISH_PRODUCTS,
    categoryId: catFish.id,
    brandId: brand.id,
    taxClassId: taxClass,
    tagType: 'fish',
  });

  console.log('\n── SEAFOOD ─────────────────────────────────────────');
  const seafoodStats = await seedProductGroup({
    defs: SEAFOOD_PRODUCTS,
    categoryId: catSeafood.id,
    brandId: brand.id,
    taxClassId: taxClass,
    tagType: 'seafood',
  });

  console.log('\n── READY TO COOK ───────────────────────────────────');
  const readyToCookStats = await seedProductGroup({
    defs: READY_TO_COOK_PRODUCTS,
    categoryId: catReadyToCook.id,
    brandId: brand.id,
    taxClassId: taxClass,
    tagType: 'ready-to-cook',
  });

  console.log('\n── EGGS ────────────────────────────────────────────');
  const eggsStats = await seedProductGroup({
    defs: EGGS_PRODUCTS,
    categoryId: catEggs.id,
    brandId: brand.id,
    taxClassId: taxClass,
    tagType: 'eggs',
  });

  console.log('\n── COMBO PACKS ─────────────────────────────────────');
  const comboStats = await seedProductGroup({
    defs: COMBO_PRODUCTS,
    categoryId: catCombo.id,
    brandId: brand.id,
    taxClassId: taxClass,
    tagType: 'combo-packs',
  });

  const groups = [chickenStats, muttonStats, fishStats, seafoodStats, readyToCookStats, eggsStats, comboStats];
  const created = groups.reduce((sum, g) => sum + g.created, 0);
  const updated = groups.reduce((sum, g) => sum + g.updated, 0);

  console.log('\n────────────────────────────────────────────────────');
  console.log(`✅ Done. ${created + updated} products processed.`);
  console.log(`   New: ${created} | Updated: ${updated}`);
  console.log(`   Chicken        : ${CHICKEN_PRODUCTS.length}`);
  console.log(`   Mutton         : ${MUTTON_PRODUCTS.length}`);
  console.log(`   Fish           : ${FISH_PRODUCTS.length}`);
  console.log(`   Seafood        : ${SEAFOOD_PRODUCTS.length}`);
  console.log(`   Ready to Cook  : ${READY_TO_COOK_PRODUCTS.length}`);
  console.log(`   Eggs           : ${EGGS_PRODUCTS.length}`);
  console.log(`   Combo Packs    : ${COMBO_PRODUCTS.length}`);
  console.log('   Brand          : Faithful Meat (all products)');
}

main()
  .catch((err) => {
    console.error('\n❌ seed-products failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
