import type { PrismaClient } from '../src/infrastructure/prisma/generated/client';

const COVERS_BY_SLUG: Record<string, string> = {
  'chez-tante-marie-cocody-angre':
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=70',
  'maquis-du-plateau-centre':
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1400&q=70',
  'maquis-gaston-tardif-rennes':
    'https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=1400&q=70',
  'cafe-bissap-jeanne-darc-rennes':
    'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=1400&q=70',
};

const FORCE_COVER_SLUGS = new Set<string>();

const COVER_POOL: readonly [string, ...string[]] = [
  'https://images.unsplash.com/photo-1598103442097-8b74394b95c2?auto=format&fit=crop&w=1400&q=70',
  'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1400&q=70',
  'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=1400&q=70',
  'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=1400&q=70',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=70',
  'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=1400&q=70',
];

export async function seedMissingRestaurantImages(prisma: PrismaClient): Promise<void> {
  const establishments = await prisma.establishment.findMany({
    select: { id: true, slug: true, coverImageUrl: true },
    orderBy: { slug: 'asc' },
  });

  let covers = 0;
  const coverByEstablishment = new Map<string, string>();

  for (const [index, establishment] of establishments.entries()) {
    const forced = FORCE_COVER_SLUGS.has(establishment.slug) ? COVERS_BY_SLUG[establishment.slug] : undefined;
    const nextCover =
      forced ??
      establishment.coverImageUrl ??
      COVERS_BY_SLUG[establishment.slug] ??
      COVER_POOL[index % COVER_POOL.length] ??
      COVER_POOL[0];
    coverByEstablishment.set(establishment.id, nextCover);
    if (establishment.coverImageUrl && !forced) {
      continue;
    }
    await prisma.establishment.update({
      where: { id: establishment.id },
      data: { coverImageUrl: nextCover },
    });
    if (forced) {
      await prisma.product.updateMany({
        where: { establishmentId: establishment.id },
        data: { imageUrl: nextCover },
      });
    }
    covers += 1;
  }

  const products = await prisma.product.findMany({
    where: { imageUrl: null },
    select: { id: true, establishmentId: true },
  });

  let dishes = 0;
  for (const product of products) {
    const imageUrl = coverByEstablishment.get(product.establishmentId);
    if (!imageUrl) {
      continue;
    }
    await prisma.product.update({
      where: { id: product.id },
      data: { imageUrl },
    });
    dishes += 1;
  }

  process.stdout.write(
    covers === 0 && dishes === 0
      ? 'Toutes les photos de restaurants sont deja en place.\n'
      : `${covers} couvertures et ${dishes} photos de plats ajoutees.\n`,
  );
}
