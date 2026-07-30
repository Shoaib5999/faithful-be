require('dotenv').config();

// Command: node prisma/seed-indexes.js

const prisma = require('../src/config/db');

async function main() {
  // Postgres native full-text search index — matches the to_tsvector/plainto_tsquery
  // query built in src/modules/search/search.service.js.
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS ft_product_search
    ON "Product"
    USING GIN (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(tags, '')))
  `);
  console.log('Postgres GIN full-text index created on Product table');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect()); 