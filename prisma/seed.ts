import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/infrastructure/prisma/generated/client';
import { seedMissingRestaurantImages } from './seed-covers';
import { seedReferenceData } from './seed-reference';
import { seedRennesDemo } from './seed-rennes';

/**
 * Point d'entree du seed : donnees de reference puis jeu de demonstration.
 *
 * Reference : specification sections 9.1, 26.2 et 30.
 *
 * Le seed est idempotent : il s'execute sur une base deja peuplee sans creer de
 * doublon, afin d'etre rejouable en integration continue et apres l'ajout d'une
 * permission.
 *
 * Les donnees de demonstration ne sont ecrites qu'en dehors de la production, et
 * aucun tarif commercial n'est invente : les plans sont crees a prix nul, en
 * attente des decisions de la section 36.
 */

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];

  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error('DATABASE_URL est requis pour executer le seed.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    await seedReferenceData(prisma);

    if (process.env['APP_ENV'] !== 'production') {
      await seedDemoData(prisma);
      await seedRennesDemo(prisma);
      await seedMissingRestaurantImages(prisma);
    }

    process.stdout.write('Seed OnMangeOu termine.\n');
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Jeu de demonstration refltant des cas reels d'Abidjan.
 *
 * Il couvre les scenarios obligatoires de la section 28.2 : un maquis ouvert la
 * nuit pour verifier le franchissement de minuit, deux etablissements distincts
 * pour l'isolation multi-tenant, et des plats en rupture.
 */
async function seedDemoData(prisma: PrismaClient): Promise<void> {
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { code: 'OWNER' } });
  const kitchenRole = await prisma.role.findUniqueOrThrow({ where: { code: 'KITCHEN' } });
  const completePlan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: 'COMPLET' } });

  const owner = await prisma.user.upsert({
    where: { phoneE164: '+2250700000001' },
    create: {
      phoneE164: '+2250700000001',
      fullName: 'Tante Marie Kone',
      status: 'ACTIVE',
      phoneVerifiedAt: new Date(),
      profile: { create: { defaultCity: 'Abidjan', defaultDistrict: 'Cocody' } },
    },
    update: {},
    select: { id: true },
  });

  const admin = await prisma.user.upsert({
    where: { phoneE164: '+2250700000009' },
    create: {
      phoneE164: '+2250700000009',
      fullName: 'Awa Kouassi',
      status: 'ACTIVE',
      phoneVerifiedAt: new Date(),
      profile: { create: { defaultCity: 'Abidjan' } },
    },
    update: {},
    select: { id: true },
  });

  await prisma.platformStaff.upsert({
    where: { userId: admin.id },
    create: {
      userId: admin.id,
      role: 'ADMIN',
      reason: 'Compte interne de demonstration, nominatif.',
    },
    update: { role: 'ADMIN', revokedAt: null },
  });

  const cook = await prisma.user.upsert({
    where: { phoneE164: '+2250700000002' },
    create: {
      phoneE164: '+2250700000002',
      fullName: 'Ibrahim Traore',
      status: 'ACTIVE',
      phoneVerifiedAt: new Date(),
      profile: { create: {} },
    },
    update: {},
    select: { id: true },
  });

  const existing = await prisma.organization.findUnique({
    where: { slug: 'chez-tante-marie' },
    select: { id: true },
  });

  if (existing) {
    process.stdout.write('Donnees de demonstration deja presentes.\n');
    return;
  }

  const now = new Date();

  const organization = await prisma.organization.create({
    data: {
      name: 'Chez Tante Marie',
      slug: 'chez-tante-marie',
      status: 'VERIFIED',
      legalName: 'Etablissement Kone Marie',
      contactPhoneE164: '+2250700000001',
      contactEmail: 'contact@chez-tante-marie.ci',
      members: {
        create: [
          { userId: owner.id, roleId: ownerRole.id, status: 'ACTIVE', acceptedAt: now },
          { userId: cook.id, roleId: kitchenRole.id, status: 'ACTIVE', acceptedAt: now },
        ],
      },
      subscriptions: {
        create: {
          planId: completePlan.id,
          status: 'TRIALING',
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
          trialEndsAt: new Date(now.getTime() + 14 * 24 * 3600 * 1000),
        },
      },
    },
    select: { id: true, members: { select: { id: true, userId: true } } },
  });

  const establishment = await prisma.establishment.create({
    data: {
      organizationId: organization.id,
      name: 'Chez Tante Marie - Cocody Angre',
      slug: 'chez-tante-marie-cocody-angre',
      status: 'PUBLISHED',
      description:
        'Cuisine ivoirienne maison : poulet braise, poisson frais et attieke prepare chaque matin.',
      phoneE164: '+2250700000001',
      city: 'Abidjan',
      district: 'Cocody Angre',
      addressLine: 'Rue L124, Angre 8e tranche',
      landmarkText: 'Face a la pharmacie Saint Jean, apres le carrefour des Deux Plateaux',
      latitude: 5.3900,
      longitude: -3.9800,
      averagePreparationMinutes: 20,
      stockMode: 'SIMPLE',
      publishedAt: now,
      verifiedAt: now,
      services: {
        create: [
          { type: 'DINE_IN', enabled: true },
          { type: 'TAKEAWAY', enabled: true, leadTimeMinutes: 15 },
          { type: 'DELIVERY', enabled: true, minimumOrderAmount: 2000n, leadTimeMinutes: 45 },
        ],
      },
      hours: {
        create: [
          // Service continu du lundi au samedi, avec fermeture apres minuit le
          // week-end : 02:00 se note 1560 minutes.
          { weekDay: 'MONDAY', opensAtMinutes: 660, closesAtMinutes: 1380 },
          { weekDay: 'TUESDAY', opensAtMinutes: 660, closesAtMinutes: 1380 },
          { weekDay: 'WEDNESDAY', opensAtMinutes: 660, closesAtMinutes: 1380 },
          { weekDay: 'THURSDAY', opensAtMinutes: 660, closesAtMinutes: 1380 },
          { weekDay: 'FRIDAY', opensAtMinutes: 660, closesAtMinutes: 1560 },
          { weekDay: 'SATURDAY', opensAtMinutes: 720, closesAtMinutes: 1560 },
        ],
      },
    },
    select: { id: true },
  });

  const ownerMember = organization.members.find((member) => member.userId === owner.id);

  if (ownerMember) {
    await prisma.memberEstablishment.create({
      data: { memberId: ownerMember.id, establishmentId: establishment.id },
    });
  }

  const cookMember = organization.members.find((member) => member.userId === cook.id);

  if (cookMember) {
    await prisma.memberEstablishment.create({
      data: { memberId: cookMember.id, establishmentId: establishment.id },
    });
  }

  const menu = await prisma.menu.create({
    data: {
      organizationId: organization.id,
      establishmentId: establishment.id,
      name: 'Carte principale',
      status: 'PUBLISHED',
      publishedAt: now,
      categories: {
        create: [
          { name: 'Grillades', position: 0 },
          { name: 'Plats de riz', position: 1 },
          { name: 'Boissons', position: 2 },
        ],
      },
    },
    select: { id: true, categories: { select: { id: true, name: true } } },
  });

  const categoryByName = new Map(menu.categories.map((category) => [category.name, category.id]));

  const products: Array<{
    name: string;
    category: string;
    amount: bigint;
    description: string;
    vegetarian?: boolean;
    halal?: boolean;
    spicyLevel?: number;
    outOfStock?: boolean;
  }> = [
    {
      name: 'Poulet braise entier',
      category: 'Grillades',
      amount: 6000n,
      description: 'Poulet braise au feu de bois, accompagne d\'attieke et de piment vert.',
      halal: true,
      spicyLevel: 2,
    },
    {
      name: 'Poisson braise (bar)',
      category: 'Grillades',
      amount: 4500n,
      description: 'Bar frais du jour, braise et servi avec alloco.',
      halal: true,
      spicyLevel: 1,
      outOfStock: true,
    },
    {
      name: 'Riz gras au poulet',
      category: 'Plats de riz',
      amount: 2500n,
      description: 'Riz mijote a la tomate, morceaux de poulet et legumes.',
      halal: true,
      spicyLevel: 1,
    },
    {
      name: 'Riz sauce graine',
      category: 'Plats de riz',
      amount: 2000n,
      description: 'Sauce graine traditionnelle, servie avec du riz blanc.',
      vegetarian: true,
    },
    {
      name: 'Bissap maison',
      category: 'Boissons',
      amount: 500n,
      description: 'Infusion d\'hibiscus fraiche, peu sucree.',
      vegetarian: true,
    },
  ];

  for (const [index, product] of products.entries()) {
    await prisma.product.create({
      data: {
        organizationId: organization.id,
        establishmentId: establishment.id,
        categoryId: categoryByName.get(product.category) ?? null,
        name: product.name,
        description: product.description,
        basePriceAmount: product.amount,
        status: 'PUBLISHED',
        position: index,
        preparationMinutes: 20,
        vegetarian: product.vegetarian ?? false,
        halal: product.halal ?? false,
        spicyLevel: product.spicyLevel ?? null,
        availability: {
          create: {
            establishmentId: establishment.id,
            status: product.outOfStock === true ? 'OUT_OF_STOCK' : 'AVAILABLE',
            reason: product.outOfStock === true ? 'Livraison de poisson non arrivee' : null,
          },
        },
        priceHistory: {
          create: { newAmount: product.amount, reason: 'Prix initial de demonstration' },
        },
      },
    });
  }

  // Second tenant, indispensable pour tester l'isolation inter-organisation
  // (scenario obligatoire 5 de la section 28.2).
  const otherOrganization = await prisma.organization.create({
    data: {
      name: 'Maquis du Plateau',
      slug: 'maquis-du-plateau',
      status: 'VERIFIED',
      contactPhoneE164: '+2250700000003',
    },
    select: { id: true },
  });

  await prisma.establishment.create({
    data: {
      organizationId: otherOrganization.id,
      name: 'Maquis du Plateau',
      slug: 'maquis-du-plateau-centre',
      status: 'PUBLISHED',
      description: 'Maquis de nuit : grillades et ambiance jusqu\'au petit matin.',
      city: 'Abidjan',
      district: 'Plateau',
      landmarkText: 'Derriere la cathedrale Saint-Paul',
      latitude: 5.3200,
      longitude: -4.0200,
      publishedAt: now,
      verifiedAt: now,
      hours: {
        create: [
          { weekDay: 'FRIDAY', opensAtMinutes: 1080, closesAtMinutes: 1680 },
          { weekDay: 'SATURDAY', opensAtMinutes: 1080, closesAtMinutes: 1680 },
        ],
      },
      services: { create: [{ type: 'DINE_IN', enabled: true }] },
    },
  });

  process.stdout.write('Donnees de demonstration creees.\n');
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Echec du seed OnMangeOu : ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
