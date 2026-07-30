// Run once to create your super admin account
// Command: node prisma/seed-admin.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

/** Matches valid keys in `roles.service.js` ALL_PERMISSIONS */
const DEFAULT_STAFF_ROLES = [
    {
        name: 'Store Manager',
        permissions: [
            'products.view', 'products.create', 'products.update', 'products.delete',
            'orders.view', 'orders.update', 'orders.cancel',
            'inventory.update',
            'reviews.view', 'reviews.moderate',
            'coupons.view', 'coupons.create', 'coupons.update', 'coupons.delete',
            'analytics.view',
            'shipping.manage',
            'leads.view', 'leads.update',
        ],
    },
    {
        name: 'Store Staff',
        permissions: [
            'products.view',
            'orders.view', 'orders.update',
            'inventory.update',
            'reviews.view',
            'coupons.view',
        ],
    },
];

async function ensureDefaultStaffRoles() {
    for (const r of DEFAULT_STAFF_ROLES) {
        await prisma.staffRole.upsert({
            where: { name: r.name },
            update: {},
            create: { name: r.name, permissions: r.permissions },
        });
    }
    console.log('✅ Default staff roles ensured (Store Manager, Store Staff)');
}

async function main() {
    await ensureDefaultStaffRoles();

    const name = 'Faithful Meat Admin';
    const email = process.env.ADMIN_EMAIL;   // change this
    const password = process.env.ADMIN_PASSWORD;           // change this immediately after first login

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        if (!existing.emailVerifiedAt) {
            await prisma.user.update({
                where: { email },
                data: { emailVerifiedAt: new Date() },
            });
            console.log('✅ Admin email marked as verified:', email);
        } else {
            console.log('⚠️  Admin already exists:', email);
        }
        return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await prisma.user.create({
        data: {
            name,
            email,
            passwordHash,
            role: 'ADMIN',
            isActive: true,
            emailVerifiedAt: new Date(),
        },
    });

    console.log('✅ Super Admin created successfully');
    console.log('   Email   :', admin.email);
    console.log('   Role    :', admin.role);
    console.log('   ID      :', admin.id);
    console.log('');
    console.log('⚠️  Please change the password after first login!');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });