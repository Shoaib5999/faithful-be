const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
    transactionOptions: {
        maxWait: 10000,
        timeout: 15000,
    },
});

module.exports = prisma;