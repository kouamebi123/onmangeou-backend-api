import { Injectable } from '@nestjs/common';
import { Prisma } from '../../infrastructure/prisma/generated/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { Clock } from '../../common/time/clock';
import { DomainError } from '../../common/errors/domain.error';
import { toMoneyView, type MoneyView } from '../../common/money/money';
import {
  buildPage,
  decodeCursor,
  normalizePageSize,
  type PageResult,
} from '../../common/pagination/cursor';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { filterServicesByModules, toPublicModules } from '../entitlements/module-codes';
import { computeOpeningStatus, type HoursException, type HoursSlot } from '../organizations/opening-hours';
import type { DiscoverRestaurantsQuery } from './dto/discovery.dto';

export interface RestaurantSummary {
  id: string;
  slug: string;
  name: string;
  city: string;
  district: string | null;
  landmarkText: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number | null;
  coverImageUrl: string | null;
  averagePreparationMinutes: number | null;
  services: string[];
  open: boolean;
  closesInMinutes: number | null;
  opensInMinutes: number | null;
  priceFrom: MoneyView | null;
  isFavorite: boolean;
  enabledModules: string[];
  hasTerrace: boolean;
  hasAirConditioning: boolean;
  accessible: boolean;
}

export interface RestaurantDetail extends RestaurantSummary {
  description: string | null;
  phoneE164: string | null;
  addressLine: string | null;
  verified: boolean;
  hours: Array<{ weekDay: string; opensAtMinutes: number; closesAtMinutes: number }>;
  menus: Array<{
    id: string;
    name: string;
    categories: Array<{
      id: string;
      name: string;
      description: string | null;
      products: Array<{
        id: string;
        name: string;
        description: string | null;
        price: MoneyView;
        available: boolean;
        vegetarian: boolean;
        halal: boolean;
        spicyLevel: number | null;
        preparationMinutes: number | null;
        imageUrl: string | null;
        allergens: string[];
      }>;
    }>;
  }>;
}

/** Ligne brute renvoyee par la requete geospatiale. */
interface DiscoveryRow {
  id: string;
  slug: string;
  name: string;
  city: string;
  district: string | null;
  landmarkText: string | null;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  coverImageUrl: string | null;
  averagePreparationMinutes: number | null;
  publishedAt: Date;
  distanceMeters: number | null;
  priceFrom: bigint | null;
  sortValue: string;
  hasTerrace: boolean;
  hasAirConditioning: boolean;
  accessible: boolean;
}

/**
 * Recherche et decouverte publiques.
 *
 * Reference : specification sections 3.1, 15.1 et 15.3.
 *
 * La requete de proximite est ecrite en SQL brut : le filtre `ST_DWithin` et le
 * tri par l'operateur KNN `<->` sont les seules formes qui exploitent l'index
 * GiST. Un calcul de distance en JavaScript imposerait de charger tous les
 * etablissements, et un `ORDER BY ST_Distance(...)` sans KNN ne serait pas
 * indexable.
 *
 * La recherche textuelle passe par `onmangeou_normalize_text`, fonction immutable
 * indexee en trigrammes :  maquis  retrouve  Maquis ,  MAQUIS  et
 *  maqus  sans balayage complet.
 */
@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly entitlements: EntitlementsService,
  ) {}

  async discover(
    query: DiscoverRestaurantsQuery,
    viewerUserId?: string,
  ): Promise<PageResult<RestaurantSummary>> {
    const limit = normalizePageSize(query.limit);
    const hasPoint = query.latitude !== undefined && query.longitude !== undefined;
    const sort = query.sort ?? (hasPoint ? 'distance' : 'recent');

    if (sort === 'distance' && !hasPoint) {
      throw new DomainError('VALIDATION_FAILED', 'Tri par distance sans coordonnees', {
        publicDetail: 'Activez la localisation ou choisissez un quartier pour trier par distance.',
        fields: [
          { field: 'latitude', code: 'REQUIRED', message: 'La position est requise pour ce tri.' },
        ],
      });
    }

    const rows = await this.queryRows(query, { limit, sort, hasPoint });

    const page = buildPage(rows, limit, (row) => ({ sortValue: row.sortValue, id: row.id }));

    const establishmentIds = page.items.map((row) => row.id);
    const [openingData, servicesByEstablishment, favorites, modulesByEstablishment] = await Promise.all([
      this.loadOpeningData(establishmentIds),
      this.loadServices(establishmentIds),
      this.loadFavorites(establishmentIds, viewerUserId),
      this.loadPublicModules(establishmentIds),
    ]);

    const now = this.clock.now();

    const summaries = page.items.map((row) => {
      const opening = computeOpeningStatus(
        now,
        openingData.slots.get(row.id) ?? [],
        openingData.exceptions.get(row.id) ?? [],
        openingData.timezones.get(row.id),
      );

      const enabledModules = modulesByEstablishment.get(row.id) ?? [];
      return this.toSummary(row, {
        opening,
        services: filterServicesByModules(servicesByEstablishment.get(row.id) ?? [], enabledModules),
        enabledModules: toPublicModules(enabledModules),
        isFavorite: favorites.has(row.id),
      });
    });

    const byOpen = query.openNow === true ? summaries.filter((summary) => summary.open) : summaries;
    const filtered =
      query.service === undefined
        ? byOpen
        : byOpen.filter((summary) => summary.services.includes(query.service as string));

    return { items: filtered, nextCursor: page.nextCursor };
  }

  /**
   * Fiche publique complete d'un restaurant.
   *
   * Seuls les menus et plats publies sont exposes, et un plat masque reste
   * invisible meme si sa categorie est visible.
   */
  async getBySlug(slug: string, viewerUserId?: string): Promise<RestaurantDetail> {
    const establishment = await this.prisma.establishment.findFirst({
      where: { slug, status: 'PUBLISHED', deletedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        phoneE164: true,
        city: true,
        district: true,
        addressLine: true,
        landmarkText: true,
        latitude: true,
        longitude: true,
        coverImageUrl: true,
        averagePreparationMinutes: true,
        verifiedAt: true,
        publishedAt: true,
        timezone: true,
        organizationId: true,
        hours: {
          orderBy: [{ weekDay: 'asc' }, { opensAtMinutes: 'asc' }],
          select: { weekDay: true, opensAtMinutes: true, closesAtMinutes: true },
        },
        hoursExceptions: {
          where: { exceptionDate: { gte: startOfToday(this.clock.now()) } },
          select: { exceptionDate: true, closed: true, opensAtMinutes: true, closesAtMinutes: true },
        },
        services: { where: { enabled: true }, select: { type: true } },
        menus: {
          where: { status: 'PUBLISHED', deletedAt: null },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            categories: {
              where: { visible: true, deletedAt: null },
              orderBy: { position: 'asc' },
              select: {
                id: true,
                name: true,
                description: true,
                products: {
                  where: { status: 'PUBLISHED', deletedAt: null },
                  orderBy: [{ position: 'asc' }, { name: 'asc' }],
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    basePriceAmount: true,
                    vegetarian: true,
                    halal: true,
                    spicyLevel: true,
                    preparationMinutes: true,
                    imageUrl: true,
                    availability: { select: { status: true, unavailableUntil: true } },
                    allergens: { select: { allergen: { select: { label: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!establishment) {
      throw new DomainError('NOT_FOUND', `Etablissement publie introuvable pour le slug ${slug}`);
    }

    const now = this.clock.now();

    const opening = computeOpeningStatus(
      now,
      establishment.hours,
      establishment.hoursExceptions.map((exception) => ({
        dateKey: exception.exceptionDate.toISOString().slice(0, 10),
        closed: exception.closed,
        opensAtMinutes: exception.opensAtMinutes,
        closesAtMinutes: exception.closesAtMinutes,
      })),
      establishment.timezone,
    );

    const isFavorite =
      viewerUserId === undefined
        ? false
        : (await this.prisma.favorite.findUnique({
            where: { userId_establishmentId: { userId: viewerUserId, establishmentId: establishment.id } },
            select: { userId: true },
          })) !== null;

    const allPrices = establishment.menus
      .flatMap((menu) => menu.categories)
      .flatMap((category) => category.products)
      .map((product) => product.basePriceAmount);

    const priceFrom = allPrices.length > 0 ? allPrices.reduce((min, p) => (p < min ? p : min)) : null;
    const entitlements = await this.entitlements.resolve(establishment.organizationId, establishment.id);
    const enabledModules = entitlements.enabledModules;
    const amenities = await this.prisma.$queryRaw<
      Array<{ has_terrace: boolean; has_air_conditioning: boolean; accessible: boolean }>
    >`
      SELECT has_terrace, has_air_conditioning, accessible
      FROM establishments WHERE id = ${establishment.id}::uuid
    `;
    const amenity = amenities[0];

    return {
      id: establishment.id,
      slug: establishment.slug,
      name: establishment.name,
      description: establishment.description,
      phoneE164: establishment.phoneE164,
      city: establishment.city,
      district: establishment.district,
      addressLine: establishment.addressLine,
      landmarkText: establishment.landmarkText,
      latitude: establishment.latitude.toNumber(),
      longitude: establishment.longitude.toNumber(),
      distanceMeters: null,
      coverImageUrl: establishment.coverImageUrl,
      averagePreparationMinutes: establishment.averagePreparationMinutes,
      verified: establishment.verifiedAt !== null,
      services: filterServicesByModules(
        establishment.services.map((service) => service.type),
        enabledModules,
      ),
      enabledModules: toPublicModules(enabledModules),
      open: opening.open,
      closesInMinutes: opening.closesInMinutes,
      opensInMinutes: opening.opensInMinutes,
      priceFrom: priceFrom === null ? null : toMoneyView(priceFrom),
      isFavorite,
      hasTerrace: Boolean(amenity?.has_terrace),
      hasAirConditioning: Boolean(amenity?.has_air_conditioning),
      accessible: Boolean(amenity?.accessible),
      hours: establishment.hours,
      menus: establishment.menus.map((menu) => ({
        id: menu.id,
        name: menu.name,
        categories: menu.categories.map((category) => ({
          id: category.id,
          name: category.name,
          description: category.description,
          products: category.products.map((product) => {
            const availability = product.availability[0];
            const temporarilyBack =
              availability?.unavailableUntil !== null &&
              availability?.unavailableUntil !== undefined &&
              availability.unavailableUntil <= now;

            return {
              id: product.id,
              name: product.name,
              description: product.description,
              price: toMoneyView(product.basePriceAmount),
              available:
                availability === undefined || availability.status === 'AVAILABLE' || temporarilyBack,
              vegetarian: product.vegetarian,
              halal: product.halal,
              spicyLevel: product.spicyLevel,
              preparationMinutes: product.preparationMinutes,
              imageUrl: product.imageUrl,
              allergens: product.allergens.map((entry) => entry.allergen.label),
            };
          }),
        })),
      })),
    };
  }

  async addFavorite(userId: string, establishmentId: string): Promise<void> {
    const exists = await this.prisma.establishment.findFirst({
      where: { id: establishmentId, status: 'PUBLISHED', deletedAt: null },
      select: { id: true },
    });

    if (!exists) {
      throw new DomainError('NOT_FOUND', `Etablissement ${establishmentId} non publie`);
    }

    // Un ajout repete est un succes : l'utilisateur a appuye deux fois, ce n'est
    // pas une erreur a lui signaler.
    await this.prisma.favorite.upsert({
      where: { userId_establishmentId: { userId, establishmentId } },
      create: { userId, establishmentId },
      update: {},
    });
  }

  async removeFavorite(userId: string, establishmentId: string): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId, establishmentId } });
  }

  async listFavorites(userId: string): Promise<RestaurantSummary[]> {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId, establishment: { status: 'PUBLISHED', deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        establishment: {
          select: {
            id: true,
            slug: true,
            name: true,
            city: true,
            district: true,
            landmarkText: true,
            latitude: true,
            longitude: true,
            coverImageUrl: true,
            averagePreparationMinutes: true,
            publishedAt: true,
          },
        },
      },
    });

    const ids = favorites.map((entry) => entry.establishment.id);
    const [openingData, services, modulesByEstablishment] = await Promise.all([
      this.loadOpeningData(ids),
      this.loadServices(ids),
      this.loadPublicModules(ids),
    ]);

    const now = this.clock.now();

    return favorites.map((entry) => {
      const establishment = entry.establishment;
      const opening = computeOpeningStatus(
        now,
        openingData.slots.get(establishment.id) ?? [],
        openingData.exceptions.get(establishment.id) ?? [],
        openingData.timezones.get(establishment.id),
      );

      return this.toSummary(
        {
          ...establishment,
          publishedAt: establishment.publishedAt ?? now,
          distanceMeters: null,
          priceFrom: null,
          sortValue: '',
          hasTerrace: false,
          hasAirConditioning: false,
          accessible: false,
        },
        {
          opening,
          services: filterServicesByModules(
            services.get(establishment.id) ?? [],
            modulesByEstablishment.get(establishment.id) ?? [],
          ),
          enabledModules: toPublicModules(modulesByEstablishment.get(establishment.id) ?? []),
          isFavorite: true,
        },
      );
    });
  }

  /**
   * Suggestions de recherche.
   *
   * Les etablissements et les plats sont interroges separement puis fusionnes :
   * une union SQL sur deux index trigrammes distincts serait moins lisible pour
   * un gain nul a cette volumetrie.
   */
  async suggest(term: string, limit = 8): Promise<Array<{ type: 'restaurant' | 'dish'; label: string; slug?: string }>> {
    if (term.trim().length < 2) {
      return [];
    }

    const establishments = await this.prisma.$queryRaw<Array<{ name: string; slug: string }>>`
      SELECT name, slug
      FROM establishments
      WHERE status = 'PUBLISHED'
        AND deleted_at IS NULL
        AND onmangeou_normalize_text(name) LIKE '%' || onmangeou_normalize_text(${term}) || '%'
      ORDER BY similarity(onmangeou_normalize_text(name), onmangeou_normalize_text(${term})) DESC
      LIMIT ${limit}
    `;

    const dishes = await this.prisma.$queryRaw<Array<{ name: string }>>`
      SELECT DISTINCT p.name
      FROM products p
      INNER JOIN establishments e ON e.id = p.establishment_id
      WHERE p.status = 'PUBLISHED'
        AND p.deleted_at IS NULL
        AND e.status = 'PUBLISHED'
        AND onmangeou_normalize_text(p.name) LIKE '%' || onmangeou_normalize_text(${term}) || '%'
      LIMIT ${limit}
    `;

    return [
      ...establishments.map((row) => ({ type: 'restaurant' as const, label: row.name, slug: row.slug })),
      ...dishes.map((row) => ({ type: 'dish' as const, label: row.name })),
    ].slice(0, limit);
  }

  private async queryRows(
    query: DiscoverRestaurantsQuery,
    options: { limit: number; sort: 'distance' | 'name' | 'recent'; hasPoint: boolean },
  ): Promise<DiscoveryRow[]> {
    const { limit, sort, hasPoint } = options;
    const fetchLimit = limit + 1;

    const point = hasPoint
      ? Prisma.sql`ST_SetSRID(ST_MakePoint(${query.longitude}::double precision, ${query.latitude}::double precision), 4326)::geography`
      : null;

    const distanceSelect = point
      ? Prisma.sql`ROUND(ST_Distance(e.location, ${point})::numeric)::double precision`
      : Prisma.sql`NULL::double precision`;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`e.status = 'PUBLISHED'`,
      Prisma.sql`e.deleted_at IS NULL`,
    ];

    if (point && query.radiusMeters !== undefined) {
      conditions.push(Prisma.sql`ST_DWithin(e.location, ${point}, ${query.radiusMeters})`);
    }

    if (query.city !== undefined) {
      conditions.push(
        Prisma.sql`onmangeou_normalize_text(e.city) = onmangeou_normalize_text(${query.city})`,
      );
    }

    if (query.district !== undefined) {
      conditions.push(
        Prisma.sql`onmangeou_normalize_text(COALESCE(e.district, '')) LIKE '%' || onmangeou_normalize_text(${query.district}) || '%'`,
      );
    }

    if (query.q !== undefined && query.q.trim().length > 0) {
      const term = query.q.trim();
      conditions.push(Prisma.sql`(
        onmangeou_normalize_text(e.name) LIKE '%' || onmangeou_normalize_text(${term}) || '%'
        OR onmangeou_normalize_text(e.city) LIKE '%' || onmangeou_normalize_text(${term}) || '%'
        OR onmangeou_normalize_text(COALESCE(e.district, '')) LIKE '%' || onmangeou_normalize_text(${term}) || '%'
        OR onmangeou_normalize_text(COALESCE(e.address_line, '')) LIKE '%' || onmangeou_normalize_text(${term}) || '%'
        OR onmangeou_normalize_text(COALESCE(e.landmark_text, '')) LIKE '%' || onmangeou_normalize_text(${term}) || '%'
        OR EXISTS (
          SELECT 1 FROM products p
          WHERE p.establishment_id = e.id
            AND p.status = 'PUBLISHED'
            AND p.deleted_at IS NULL
            AND onmangeou_normalize_text(p.name) LIKE '%' || onmangeou_normalize_text(${term}) || '%'
        )
      )`);
    }

    if (query.service !== undefined) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM restaurant_services s
        WHERE s.establishment_id = e.id AND s.enabled = true AND s.type = ${query.service}::"ServiceType"
      )`);
    }

    if (query.terrace === true) {
      conditions.push(Prisma.sql`e.has_terrace = true`);
    }
    if (query.airConditioning === true) {
      conditions.push(Prisma.sql`e.has_air_conditioning = true`);
    }
    if (query.accessible === true) {
      conditions.push(Prisma.sql`e.accessible = true`);
    }

    const productConditions = this.buildProductConditions(query);

    if (productConditions.length > 0) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM products p
        WHERE p.establishment_id = e.id
          AND p.status = 'PUBLISHED'
          AND p.deleted_at IS NULL
          AND ${Prisma.join(productConditions, ' AND ')}
      )`);
    }

    const cursorCondition = this.buildCursorCondition(query.cursor, sort, point);

    if (cursorCondition) {
      conditions.push(cursorCondition);
    }

    const sortValueSelect =
      sort === 'distance' && point
        ? Prisma.sql`LPAD(ROUND(ST_Distance(e.location, ${point})::numeric)::text, 12, '0')`
        : sort === 'name'
          ? Prisma.sql`onmangeou_normalize_text(e.name)`
          : Prisma.sql`to_char(e.published_at, 'YYYYMMDDHH24MISSMS')`;

    const orderBy =
      sort === 'distance' && point
        ? // Operateur KNN : seul <-> utilise l'index GiST pour le tri.
          Prisma.sql`e.location <-> ${point} ASC, e.id ASC`
        : sort === 'name'
          ? Prisma.sql`onmangeou_normalize_text(e.name) ASC, e.id ASC`
          : Prisma.sql`e.published_at DESC, e.id ASC`;

    return this.prisma.$queryRaw<DiscoveryRow[]>(Prisma.sql`
      SELECT
        e.id,
        e.slug,
        e.name,
        e.city,
        e.district AS "district",
        e.landmark_text AS "landmarkText",
        e.latitude,
        e.longitude,
        e.cover_image_url AS "coverImageUrl",
        e.average_preparation_minutes AS "averagePreparationMinutes",
        e.has_terrace AS "hasTerrace",
        e.has_air_conditioning AS "hasAirConditioning",
        e.accessible,
        e.published_at AS "publishedAt",
        ${distanceSelect} AS "distanceMeters",
        (
          SELECT MIN(p.base_price_amount)
          FROM products p
          WHERE p.establishment_id = e.id AND p.status = 'PUBLISHED' AND p.deleted_at IS NULL
        ) AS "priceFrom",
        ${sortValueSelect} AS "sortValue"
      FROM establishments e
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${fetchLimit}
    `);
  }

  private buildProductConditions(query: DiscoverRestaurantsQuery): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [];

    if (query.minPrice !== undefined) {
      conditions.push(Prisma.sql`p.base_price_amount >= ${BigInt(query.minPrice)}`);
    }
    if (query.maxPrice !== undefined) {
      conditions.push(Prisma.sql`p.base_price_amount <= ${BigInt(query.maxPrice)}`);
    }
    if (query.vegetarian === true) {
      conditions.push(Prisma.sql`p.vegetarian = true`);
    }
    if (query.halal === true) {
      conditions.push(Prisma.sql`p.halal = true`);
    }

    return conditions;
  }

  /**
   * Condition de reprise de pagination.
   *
   * Le couple (valeur de tri, identifiant) est strictement croissant, ce qui
   * evite qu'une egalite de distance ou de nom fasse boucler la pagination.
   */
  private buildCursorCondition(
    cursor: string | undefined,
    sort: 'distance' | 'name' | 'recent',
    point: Prisma.Sql | null,
  ): Prisma.Sql | null {
    if (cursor === undefined) {
      return null;
    }

    const decoded = decodeCursor(cursor);

    if (sort === 'distance' && point) {
      return Prisma.sql`(
        LPAD(ROUND(ST_Distance(e.location, ${point})::numeric)::text, 12, '0'), e.id::text
      ) > (${decoded.sortValue}, ${decoded.id})`;
    }

    if (sort === 'name') {
      return Prisma.sql`(onmangeou_normalize_text(e.name), e.id::text) > (${decoded.sortValue}, ${decoded.id})`;
    }

    return Prisma.sql`(to_char(e.published_at, 'YYYYMMDDHH24MISSMS'), e.id::text) < (${decoded.sortValue}, ${decoded.id})`;
  }

  private async loadOpeningData(establishmentIds: string[]): Promise<{
    slots: Map<string, HoursSlot[]>;
    exceptions: Map<string, HoursException[]>;
    timezones: Map<string, string>;
  }> {
    if (establishmentIds.length === 0) {
      return { slots: new Map(), exceptions: new Map(), timezones: new Map() };
    }

    const [hours, exceptions, establishments] = await Promise.all([
      this.prisma.establishmentHours.findMany({
        where: { establishmentId: { in: establishmentIds } },
        select: { establishmentId: true, weekDay: true, opensAtMinutes: true, closesAtMinutes: true },
      }),
      this.prisma.establishmentHoursException.findMany({
        where: {
          establishmentId: { in: establishmentIds },
          exceptionDate: { gte: startOfToday(this.clock.now()) },
        },
        select: {
          establishmentId: true,
          exceptionDate: true,
          closed: true,
          opensAtMinutes: true,
          closesAtMinutes: true,
        },
      }),
      this.prisma.establishment.findMany({
        where: { id: { in: establishmentIds } },
        select: { id: true, timezone: true },
      }),
    ]);

    const slots = new Map<string, HoursSlot[]>();
    for (const hour of hours) {
      const list = slots.get(hour.establishmentId) ?? [];
      list.push({
        weekDay: hour.weekDay,
        opensAtMinutes: hour.opensAtMinutes,
        closesAtMinutes: hour.closesAtMinutes,
      });
      slots.set(hour.establishmentId, list);
    }

    const exceptionMap = new Map<string, HoursException[]>();
    for (const exception of exceptions) {
      const list = exceptionMap.get(exception.establishmentId) ?? [];
      list.push({
        dateKey: exception.exceptionDate.toISOString().slice(0, 10),
        closed: exception.closed,
        opensAtMinutes: exception.opensAtMinutes,
        closesAtMinutes: exception.closesAtMinutes,
      });
      exceptionMap.set(exception.establishmentId, list);
    }

    const timezones = new Map(establishments.map((item) => [item.id, item.timezone]));

    return { slots, exceptions: exceptionMap, timezones };
  }

  private async loadServices(establishmentIds: string[]): Promise<Map<string, string[]>> {
    if (establishmentIds.length === 0) {
      return new Map();
    }

    const services = await this.prisma.restaurantService.findMany({
      where: { establishmentId: { in: establishmentIds }, enabled: true },
      select: { establishmentId: true, type: true },
    });

    const map = new Map<string, string[]>();
    for (const service of services) {
      const list = map.get(service.establishmentId) ?? [];
      list.push(service.type);
      map.set(service.establishmentId, list);
    }

    return map;
  }

  private async loadFavorites(
    establishmentIds: string[],
    viewerUserId: string | undefined,
  ): Promise<Set<string>> {
    if (viewerUserId === undefined || establishmentIds.length === 0) {
      return new Set();
    }

    const favorites = await this.prisma.favorite.findMany({
      where: { userId: viewerUserId, establishmentId: { in: establishmentIds } },
      select: { establishmentId: true },
    });

    return new Set(favorites.map((entry) => entry.establishmentId));
  }

  private toSummary(
    row: Omit<DiscoveryRow, 'latitude' | 'longitude'> & {
      latitude: Prisma.Decimal;
      longitude: Prisma.Decimal;
    },
    context: {
      opening: ReturnType<typeof computeOpeningStatus>;
      services: string[];
      enabledModules: string[];
      isFavorite: boolean;
    },
  ): RestaurantSummary {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      city: row.city,
      district: row.district,
      landmarkText: row.landmarkText,
      latitude: row.latitude.toNumber(),
      longitude: row.longitude.toNumber(),
      distanceMeters: row.distanceMeters,
      coverImageUrl: row.coverImageUrl,
      averagePreparationMinutes: row.averagePreparationMinutes,
      services: context.services,
      open: context.opening.open,
      closesInMinutes: context.opening.closesInMinutes,
      opensInMinutes: context.opening.opensInMinutes,
      priceFrom: row.priceFrom === null ? null : toMoneyView(row.priceFrom),
      isFavorite: context.isFavorite,
      enabledModules: context.enabledModules,
      hasTerrace: Boolean(row.hasTerrace),
      hasAirConditioning: Boolean(row.hasAirConditioning),
      accessible: Boolean(row.accessible),
    };
  }

  private async loadPublicModules(establishmentIds: string[]): Promise<Map<string, string[]>> {
    if (establishmentIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.establishment.findMany({
      where: { id: { in: establishmentIds } },
      select: { id: true, organizationId: true },
    });
    const uniqueOrgs = [...new Set(rows.map((row) => row.organizationId))];
    const byOrg = new Map<string, string[]>();
    await Promise.all(
      uniqueOrgs.map(async (organizationId) => {
        const view = await this.entitlements.resolve(organizationId);
        byOrg.set(organizationId, view.enabledModules);
      }),
    );
    return new Map(rows.map((row) => [row.id, byOrg.get(row.organizationId) ?? []]));
  }
}

function startOfToday(instant: Date): Date {
  const copy = new Date(instant);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}
