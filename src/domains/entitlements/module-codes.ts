/**
 * Codes de modules activables (specification section 30).
 *
 * L'acces fonctionnel est calcule par le serveur : plan, modules, periode,
 * essai, suspension et override administratif audite. Le mobile recoit un objet
 * d'entitlements et construit sa navigation ; il ne code jamais une offre
 * commerciale en dur.
 */
export const MODULE_CODES = {
  STOREFRONT_BASIC: 'storefront.basic',
  CATALOG_ADVANCED: 'catalog.advanced',
  ORDERS_MARKETPLACE: 'orders.marketplace',
  ORDERS_MANUAL: 'orders.manual',
  RESERVATIONS_TABLES: 'reservations.tables',
  PAYMENTS_ONLINE: 'payments.online',
  CASH_REGISTER: 'cash.register',
  FINANCE_EXPENSES: 'finance.expenses',
  FINANCE_CREDITS: 'finance.credits',
  INVENTORY_SIMPLE: 'inventory.simple',
  INVENTORY_INGREDIENTS: 'inventory.ingredients',
  DELIVERY_INTERNAL: 'delivery.internal',
  MARKETING_PROMOTIONS: 'marketing.promotions',
  ANALYTICS_ADVANCED: 'analytics.advanced',
  ORGANIZATION_MULTISITE: 'organization.multisite',
} as const;

export type ModuleCode = (typeof MODULE_CODES)[keyof typeof MODULE_CODES];

export const ALL_MODULE_CODES: readonly ModuleCode[] = Object.values(MODULE_CODES);

/** Modules visibles cote public (client et site). Les autres restent internes au commerçant. */
export const PUBLIC_MODULE_CODES = [
  MODULE_CODES.STOREFRONT_BASIC,
  MODULE_CODES.CATALOG_ADVANCED,
  MODULE_CODES.ORDERS_MARKETPLACE,
  MODULE_CODES.RESERVATIONS_TABLES,
  MODULE_CODES.PAYMENTS_ONLINE,
  MODULE_CODES.DELIVERY_INTERNAL,
  MODULE_CODES.MARKETING_PROMOTIONS,
] as const;

export type PublicModuleCode = (typeof PUBLIC_MODULE_CODES)[number];

export function toPublicModules(enabled: readonly string[]): PublicModuleCode[] {
  const allowed = new Set<string>(PUBLIC_MODULE_CODES);
  return enabled.filter((code): code is PublicModuleCode => allowed.has(code));
}

export function filterServicesByModules(services: string[], enabled: readonly string[]): string[] {
  const active = new Set(enabled);
  return services.filter((service) => {
    if (service === 'DELIVERY') {
      return active.has(MODULE_CODES.DELIVERY_INTERNAL);
    }
    if (service === 'RESERVATION') {
      return active.has(MODULE_CODES.RESERVATIONS_TABLES);
    }
    return true;
  });
}

export const MODULE_LABELS: Readonly<Record<ModuleCode, string>> = {
  [MODULE_CODES.STOREFRONT_BASIC]: 'Vitrine',
  [MODULE_CODES.CATALOG_ADVANCED]: 'Catalogue avance',
  [MODULE_CODES.ORDERS_MARKETPLACE]: 'Commandes en ligne',
  [MODULE_CODES.ORDERS_MANUAL]: 'Commandes de salle',
  [MODULE_CODES.RESERVATIONS_TABLES]: 'Reservation de tables',
  [MODULE_CODES.PAYMENTS_ONLINE]: 'Paiement en ligne',
  [MODULE_CODES.CASH_REGISTER]: 'Caisse',
  [MODULE_CODES.FINANCE_EXPENSES]: 'Depenses',
  [MODULE_CODES.FINANCE_CREDITS]: 'Credits et dettes',
  [MODULE_CODES.INVENTORY_SIMPLE]: 'Stock simple',
  [MODULE_CODES.INVENTORY_INGREDIENTS]: 'Stock par ingredients',
  [MODULE_CODES.DELIVERY_INTERNAL]: 'Livraison interne',
  [MODULE_CODES.MARKETING_PROMOTIONS]: 'Promotions',
  [MODULE_CODES.ANALYTICS_ADVANCED]: 'Statistiques avancees',
  [MODULE_CODES.ORGANIZATION_MULTISITE]: 'Multi-etablissements',
};
