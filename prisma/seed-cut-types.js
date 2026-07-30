/**
 * Seed core cut types for CMS + product tags.
 * Run: npm run seed:cut-types
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');
const slugify = require('../src/utils/slugify');
const { CORE_CUT_TYPE_NAMES } = require('./core-cut-types');

const prisma = new PrismaClient();

async function main() {
  console.log('🥩 Seeding core cut types...\n');

  const coreSlugs = CORE_CUT_TYPE_NAMES.map((name) => slugify(name));
  let created = 0;
  let updated = 0;

  for (let i = 0; i < CORE_CUT_TYPE_NAMES.length; i += 1) {
    const name = CORE_CUT_TYPE_NAMES[i];
    const slug = slugify(name);
    const existing = await prisma.cutType.findUnique({ where: { slug } });

    if (existing) {
      const patch = { isActive: true, sortOrder: i };
      const unchanged = existing.isActive && existing.sortOrder === i;
      if (!unchanged) {
        await prisma.cutType.update({ where: { slug }, data: patch });
        updated += 1;
      }
      continue;
    }

    await prisma.cutType.create({
      data: {
        name,
        slug,
        sortOrder: i,
        isActive: true,
      },
    });
    created += 1;
  }

  const deactivateResult = await prisma.cutType.updateMany({
    where: { slug: { notIn: coreSlugs } },
    data: { isActive: false },
  });

  console.log(
    `  Created: ${created} | Updated: ${updated} | Deactivated extras: ${deactivateResult.count}\n`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
