import type { PrismaClient } from '../src/infrastructure/prisma/generated/client';

type WeekDay = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

const WEEK: WeekDay[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const WEEK_NO_SUNDAY: WeekDay[] = WEEK.filter((day) => day !== 'SUNDAY');

function hours(days: WeekDay[], opensAtMinutes: number, closesAtMinutes: number) {
  return days.map((weekDay) => ({ weekDay, opensAtMinutes, closesAtMinutes }));
}

/**
 * Dix restaurants publies autour de 10 rue Gaston Tardif, 35000 Rennes
 * (48.1168, -1.6824).
 */
export async function seedRennesDemo(prisma: PrismaClient): Promise<void> {
  const now = new Date();
  const organization = await prisma.organization.upsert({
    where: { slug: 'saveurs-rennes' },
    create: {
      name: 'Saveurs de Rennes',
      slug: 'saveurs-rennes',
      status: 'VERIFIED',
      contactPhoneE164: '+33600000010',
      contactEmail: 'contact@saveurs-rennes.fr',
    },
    update: {},
    select: { id: true },
  });

  const restaurants: Array<{
    name: string;
    slug: string;
    district: string;
    addressLine: string;
    landmarkText: string;
    latitude: number;
    longitude: number;
    description: string;
    phoneE164: string;
    coverImageUrl: string;
    hours: Array<{ weekDay: WeekDay; opensAtMinutes: number; closesAtMinutes: number }>;
    services: Array<{
      type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
      enabled: boolean;
      leadTimeMinutes?: number;
    }>;
    product: {
      name: string;
      amount: bigint;
      description: string;
      imageUrl: string;
      vegetarian?: boolean;
      halal?: boolean;
    };
  }> = [
    {
      name: 'Maquis Gaston Tardif',
      slug: 'maquis-gaston-tardif-rennes',
      district: 'Villejean',
      addressLine: '8 rue Gaston Tardif, 35000 Rennes',
      landmarkText: 'En face de la Maison d’accueil Gaston Tardif',
      latitude: 48.1174,
      longitude: -1.6811,
      description: 'Grillades ivoiriennes à deux pas de chez vous.',
      phoneE164: '+33600000011',
      coverImageUrl:
        'https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=1400&q=70',
      hours: hours(WEEK, 690, 1350),
      services: [
        { type: 'DINE_IN', enabled: true },
        { type: 'TAKEAWAY', enabled: true, leadTimeMinutes: 15 },
      ],
      product: {
        name: 'Poulet braisé attiéké',
        amount: 5500n,
        halal: true,
        description: 'Poulet mariné au feu, attiéké et sauce tomate pimentée.',
        imageUrl:
          'https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=800&q=70',
      },
    },
    {
      name: 'Chez Awa Beauregard',
      slug: 'chez-awa-beauregard-rennes',
      district: 'Beauregard',
      addressLine: '12 allée de Beauregard, 35000 Rennes',
      landmarkText: 'Près du parc de Beauregard',
      latitude: 48.1248,
      longitude: -1.6895,
      description: 'Sauce graine, kedjenou et alloco faits maison.',
      phoneE164: '+33600000012',
      coverImageUrl:
        'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=1400&q=70',
      hours: hours(WEEK_NO_SUNDAY, 690, 1320),
      services: [
        { type: 'DINE_IN', enabled: true },
        { type: 'TAKEAWAY', enabled: true, leadTimeMinutes: 20 },
      ],
      product: {
        name: 'Kedjenou de poulet',
        amount: 4800n,
        halal: true,
        description: 'Poulet mijoté en cocotte, sauce graine et alloco.',
        imageUrl:
          'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=800&q=70',
      },
    },
    {
      name: 'Attiéké République',
      slug: 'attieke-republique-rennes',
      district: 'Centre',
      addressLine: '4 place de la République, 35000 Rennes',
      landmarkText: 'Sortie métro République',
      latitude: 48.1114,
      longitude: -1.6779,
      description: 'Attiéké, garba et poissons braisés en centre-ville.',
      phoneE164: '+33600000013',
      coverImageUrl:
        'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=1400&q=70',
      hours: hours(WEEK, 660, 1380),
      services: [
        { type: 'DINE_IN', enabled: true },
        { type: 'TAKEAWAY', enabled: true, leadTimeMinutes: 10 },
        { type: 'DELIVERY', enabled: true, leadTimeMinutes: 35 },
      ],
      product: {
        name: 'Garba thon',
        amount: 2500n,
        vegetarian: false,
        halal: true,
        description: 'Attiéké, thon frit et piment — le classique du déjeuner.',
        imageUrl:
          'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=70',
      },
    },
    {
      name: 'Le Thabor Braisé',
      slug: 'le-thabor-braise-rennes',
      district: 'Thabor',
      addressLine: '18 place Saint-Mélaine, 35000 Rennes',
      landmarkText: 'Devant le jardin du Thabor',
      latitude: 48.1142,
      longitude: -1.6688,
      description: 'Braisés au feu de bois, terrasse côté parc.',
      phoneE164: '+33600000014',
      coverImageUrl:
        'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=1400&q=70',
      hours: hours(WEEK, 720, 1410),
      services: [{ type: 'DINE_IN', enabled: true }],
      product: {
        name: 'Poisson braisé alloco',
        amount: 5200n,
        halal: true,
        description: 'Poisson entier au feu de bois, alloco et oignons marinés.',
        imageUrl:
          'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=800&q=70',
      },
    },
    {
      name: 'Grillades du Colombier',
      slug: 'grillades-du-colombier-rennes',
      district: 'Colombier',
      addressLine: '6 rue du Capitaine Maignan, 35000 Rennes',
      landmarkText: 'Derrière le centre commercial Colombier',
      latitude: 48.1051,
      longitude: -1.6792,
      description: 'Brochettes, alloco et attiéké à emporter.',
      phoneE164: '+33600000015',
      coverImageUrl:
        'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1400&q=70',
      hours: hours(WEEK_NO_SUNDAY, 690, 1350),
      services: [
        { type: 'DINE_IN', enabled: true },
        { type: 'TAKEAWAY', enabled: true, leadTimeMinutes: 12 },
      ],
      product: {
        name: 'Brochettes de bœuf',
        amount: 4000n,
        halal: true,
        description: 'Brochettes grillées, attiéké et sauce oignon.',
        imageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=70',
      },
    },
    {
      name: 'Bar d’Ivoire Saint-Hélier',
      slug: 'bar-ivoire-saint-helier-rennes',
      district: 'Saint-Hélier',
      addressLine: '22 boulevard de la Liberté, 35000 Rennes',
      landmarkText: 'Angle rue Saint-Hélier',
      latitude: 48.1078,
      longitude: -1.6645,
      description: 'Maquis décontracté, bière et grillades.',
      phoneE164: '+33600000016',
      coverImageUrl:
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=70',
      hours: hours(WEEK, 720, 1440),
      services: [{ type: 'DINE_IN', enabled: true }],
      product: {
        name: 'Alloco fromage',
        amount: 1800n,
        vegetarian: true,
        description: 'Banane plantain frite, fromage fondu et piment doux.',
        imageUrl:
          'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=70',
      },
    },
    {
      name: 'Alloco Night Cleunay',
      slug: 'alloco-night-cleunay-rennes',
      district: 'Cleunay',
      addressLine: '3 rue de Lorient, 35000 Rennes',
      landmarkText: 'Après le pont de Cleunay',
      latitude: 48.1048,
      longitude: -1.7075,
      description: 'Ouvert tard : alloco, brochettes et ambiance.',
      phoneE164: '+33600000017',
      coverImageUrl:
        'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=1400&q=70',
      hours: hours(['FRIDAY', 'SATURDAY', 'SUNDAY'], 1080, 1560),
      services: [{ type: 'DINE_IN', enabled: true }],
      product: {
        name: 'Alloco nuit',
        amount: 1500n,
        vegetarian: true,
        description: 'Alloco croustillant servi jusqu’au bout de la nuit.',
        imageUrl:
          'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=70',
      },
    },
    {
      name: 'Riz Gras Maurepas',
      slug: 'riz-gras-maurepas-rennes',
      district: 'Maurepas',
      addressLine: '9 rue de Nantes, 35000 Rennes',
      landmarkText: 'Face au marché de Maurepas',
      latitude: 48.1231,
      longitude: -1.6558,
      description: 'Riz gras, sauce graine et plats du jour.',
      phoneE164: '+33600000018',
      coverImageUrl:
        'https://images.unsplash.com/photo-1516684669134-de6f7c473a2a?auto=format&fit=crop&w=1400&q=70',
      hours: hours(WEEK, 660, 1260),
      services: [
        { type: 'DINE_IN', enabled: true },
        { type: 'TAKEAWAY', enabled: true, leadTimeMinutes: 15 },
        { type: 'DELIVERY', enabled: true, leadTimeMinutes: 40 },
      ],
      product: {
        name: 'Riz gras au poulet',
        amount: 2800n,
        halal: true,
        description: 'Riz gras parfumé, poulet braisé et légumes du jour.',
        imageUrl:
          'https://images.unsplash.com/photo-1516684669134-de6f7c473a2a?auto=format&fit=crop&w=800&q=70',
      },
    },
    {
      name: 'Café Bissap Jeanne d’Arc',
      slug: 'cafe-bissap-jeanne-darc-rennes',
      district: 'Jeanne d’Arc',
      addressLine: '15 rue de Paris, 35000 Rennes',
      landmarkText: 'Arrêt Jeanne d’Arc',
      latitude: 48.1186,
      longitude: -1.6702,
      description: 'Bissap, jus de gingembre et pâtisseries. Ferme en fin d’après-midi.',
      phoneE164: '+33600000019',
      coverImageUrl:
        'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=1400&q=70',
      hours: hours(WEEK, 480, 1080),
      services: [
        { type: 'DINE_IN', enabled: true },
        { type: 'TAKEAWAY', enabled: true, leadTimeMinutes: 5 },
      ],
      product: {
        name: 'Bissap maison',
        amount: 400n,
        vegetarian: true,
        description: 'Infusion d’hibiscus, gingembre et un soupçon de menthe.',
        imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=800&q=70',
      },
    },
    {
      name: 'Pontchaillou Poulet',
      slug: 'pontchaillou-poulet-rennes',
      district: 'Villejean',
      addressLine: '2 rue de la Harpe, 35000 Rennes',
      landmarkText: 'Sortie CHU Pontchaillou',
      latitude: 48.1212,
      longitude: -1.6938,
      description: 'Poulet braisé pour les soignants et les riverains.',
      phoneE164: '+33600000020',
      coverImageUrl:
        'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=1400&q=70',
      hours: hours(WEEK, 690, 1320),
      services: [
        { type: 'DINE_IN', enabled: true },
        { type: 'TAKEAWAY', enabled: true, leadTimeMinutes: 10 },
        { type: 'DELIVERY', enabled: true, leadTimeMinutes: 25 },
      ],
      product: {
        name: 'Pizza attiéké poulet',
        amount: 3500n,
        halal: true,
        description: 'Base attiéké, poulet braisé et fromage gratiné.',
        imageUrl:
          'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=800&q=70',
      },
    },
  ];

  let created = 0;

  for (const restaurant of restaurants) {
    const existing = await prisma.establishment.findUnique({
      where: { slug: restaurant.slug },
      select: { id: true },
    });
    if (existing) {
      await prisma.establishment.update({
        where: { id: existing.id },
        data: {
          coverImageUrl: restaurant.coverImageUrl,
          phoneE164: restaurant.phoneE164,
        },
      });
      await prisma.product.updateMany({
        where: { establishmentId: existing.id },
        data: {
          description: restaurant.product.description,
          imageUrl: restaurant.product.imageUrl,
        },
      });
      continue;
    }

    const establishment = await prisma.establishment.create({
      data: {
        organizationId: organization.id,
        name: restaurant.name,
        slug: restaurant.slug,
        status: 'PUBLISHED',
        description: restaurant.description,
        city: 'Rennes',
        district: restaurant.district,
        addressLine: restaurant.addressLine,
        landmarkText: restaurant.landmarkText,
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
        timezone: 'Europe/Paris',
        averagePreparationMinutes: 20,
        publishedAt: now,
        verifiedAt: now,
        coverImageUrl: restaurant.coverImageUrl,
        phoneE164: restaurant.phoneE164,
        hours: { create: restaurant.hours },
        services: { create: restaurant.services },
      },
      select: { id: true },
    });

    const menu = await prisma.menu.create({
      data: {
        organizationId: organization.id,
        establishmentId: establishment.id,
        name: 'Carte',
        status: 'PUBLISHED',
        publishedAt: now,
        categories: { create: [{ name: 'Plats', position: 0 }] },
      },
      select: { id: true, categories: { select: { id: true } } },
    });

    const categoryId = menu.categories[0]?.id ?? null;

    await prisma.product.create({
      data: {
        organizationId: organization.id,
        establishmentId: establishment.id,
        categoryId,
        name: restaurant.product.name,
        description: restaurant.product.description,
        imageUrl: restaurant.product.imageUrl,
        basePriceAmount: restaurant.product.amount,
        status: 'PUBLISHED',
        position: 0,
        preparationMinutes: 20,
        vegetarian: restaurant.product.vegetarian ?? false,
        halal: restaurant.product.halal ?? false,
        availability: {
          create: { establishmentId: establishment.id, status: 'AVAILABLE' },
        },
        priceHistory: {
          create: { newAmount: restaurant.product.amount, reason: 'Prix initial Rennes' },
        },
      },
    });

    created += 1;
  }

  process.stdout.write(
    created === 0 ? 'Restaurants de Rennes deja presents.\n' : `${created} restaurants de Rennes crees.\n`,
  );
}
