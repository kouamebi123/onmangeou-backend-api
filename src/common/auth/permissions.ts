/**
 * Permissions atomiques OnMangeOu.
 *
 * Reference : specification section 9.1.
 *
 * La matrice de roles est derivee de ces codes. Aucune condition de role ne doit
 * apparaitre ailleurs dans le code : un ecran ou un service verifie une
 * permission, jamais un nom de role.
 */

export const PERMISSIONS = {
  // Organisation et etablissements
  ORGANIZATION_READ: 'organization.read',
  ORGANIZATION_WRITE: 'organization.write',
  ESTABLISHMENT_READ: 'establishment.read',
  ESTABLISHMENT_WRITE: 'establishment.write',
  ESTABLISHMENT_HOURS_WRITE: 'establishment.hours.write',
  ESTABLISHMENT_SUBMIT_VERIFICATION: 'establishment.verification.submit',

  // Equipe
  MEMBER_READ: 'member.read',
  MEMBER_WRITE: 'member.write',
  ROLE_ASSIGN: 'member.role.assign',

  // Catalogue
  CATALOG_READ: 'catalog.read',
  CATALOG_MENU_WRITE: 'catalog.menu.write',
  CATALOG_PRODUCT_WRITE: 'catalog.product.write',
  CATALOG_PRICE_WRITE: 'catalog.price.write',
  CATALOG_AVAILABILITY_WRITE: 'catalog.availability.write',
  CATALOG_PUBLISH: 'catalog.publish',

  // Commandes (tranche suivante, declarees pour figer le vocabulaire)
  ORDERS_READ: 'orders.read',
  ORDERS_ACCEPT: 'orders.accept',
  ORDERS_REJECT: 'orders.reject',
  ORDERS_STATUS_WRITE: 'orders.status.write',
  ORDERS_PREPARE: 'orders.prepare',
  ORDERS_DELIVER: 'orders.deliver',

  // Encaissement et finance
  CASH_SESSION_WRITE: 'cash.session.write',
  CASH_MOVEMENT_WRITE: 'cash.movement.write',
  EXPENSES_CREATE: 'expenses.create',
  EXPENSES_APPROVE: 'expenses.approve',
  PAYMENTS_REFUND: 'payments.refund',
  REPORTS_READ: 'reports.read',
  REPORTS_MARGIN_READ: 'reports.margin.read',

  // Stock
  INVENTORY_READ: 'inventory.read',
  INVENTORY_WRITE: 'inventory.write',
  INVENTORY_CONSUME: 'inventory.consume',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Permissions de la plateforme, hors matrice restaurant.
 *
 * Elles ne sont jamais attribuees via un role d'organisation : un proprietaire
 * ne doit pas pouvoir s'auto-promouvoir administrateur (specification section 31).
 */
export const PLATFORM_PERMISSIONS = {
  ADMIN_VERIFICATION_READ: 'admin.verification.read',
  ADMIN_VERIFICATION_DECIDE: 'admin.verification.decide',
  ADMIN_ESTABLISHMENT_READ: 'admin.establishment.read',
  ADMIN_AUDIT_READ: 'admin.audit.read',
  ADMIN_USER_READ: 'admin.user.read',
  ADMIN_BILLING_READ: 'admin.billing.read',
  ADMIN_BILLING_WRITE: 'admin.billing.write',
} as const;

export type PlatformPermissionCode = (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

export type AnyPermissionCode = PermissionCode | PlatformPermissionCode;

export const PLATFORM_ROLE_CODES = {
  ADMIN: 'ADMIN',
  SUPPORT: 'SUPPORT',
} as const;

export const PLATFORM_ROLE_PERMISSION_MATRIX: Readonly<
  Record<(typeof PLATFORM_ROLE_CODES)[keyof typeof PLATFORM_ROLE_CODES], readonly PlatformPermissionCode[]>
> = {
  ADMIN: Object.values(PLATFORM_PERMISSIONS),
  SUPPORT: [
    PLATFORM_PERMISSIONS.ADMIN_VERIFICATION_READ,
    PLATFORM_PERMISSIONS.ADMIN_ESTABLISHMENT_READ,
    PLATFORM_PERMISSIONS.ADMIN_AUDIT_READ,
    PLATFORM_PERMISSIONS.ADMIN_USER_READ,
    PLATFORM_PERMISSIONS.ADMIN_BILLING_READ,
  ],
};

/** Permissions exigeant une reauthentification recente (specification section 9.2). */
export const REAUTH_REQUIRED_PERMISSIONS: ReadonlySet<string> = new Set<string>([
  PERMISSIONS.PAYMENTS_REFUND,
  PERMISSIONS.ROLE_ASSIGN,
  PERMISSIONS.MEMBER_WRITE,
  PLATFORM_PERMISSIONS.ADMIN_VERIFICATION_DECIDE,
]);

export const ROLE_CODES = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  WAITER: 'WAITER',
  KITCHEN: 'KITCHEN',
  COURIER: 'COURIER',
  ACCOUNTANT: 'ACCOUNTANT',
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

/**
 * Matrice role vers permissions, transcription directe du tableau de la
 * section 9.1 de la specification.
 *
 * Le role cuisine n'a volontairement aucun acces a la marge : c'est le scenario
 * de test obligatoire numero 10 de la section 28.2.
 */
export const ROLE_PERMISSION_MATRIX: Readonly<Record<RoleCode, readonly PermissionCode[]>> = {
  OWNER: Object.values(PERMISSIONS),

  MANAGER: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.ESTABLISHMENT_READ,
    PERMISSIONS.ESTABLISHMENT_WRITE,
    PERMISSIONS.ESTABLISHMENT_HOURS_WRITE,
    PERMISSIONS.ESTABLISHMENT_SUBMIT_VERIFICATION,
    PERMISSIONS.MEMBER_READ,
    PERMISSIONS.MEMBER_WRITE,
    PERMISSIONS.CATALOG_READ,
    PERMISSIONS.CATALOG_MENU_WRITE,
    PERMISSIONS.CATALOG_PRODUCT_WRITE,
    PERMISSIONS.CATALOG_PRICE_WRITE,
    PERMISSIONS.CATALOG_AVAILABILITY_WRITE,
    PERMISSIONS.CATALOG_PUBLISH,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_ACCEPT,
    PERMISSIONS.ORDERS_REJECT,
    PERMISSIONS.ORDERS_STATUS_WRITE,
    PERMISSIONS.CASH_SESSION_WRITE,
    PERMISSIONS.CASH_MOVEMENT_WRITE,
    PERMISSIONS.EXPENSES_CREATE,
    PERMISSIONS.EXPENSES_APPROVE,
    PERMISSIONS.PAYMENTS_REFUND,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.REPORTS_MARGIN_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
  ],

  CASHIER: [
    PERMISSIONS.ESTABLISHMENT_READ,
    PERMISSIONS.CATALOG_READ,
    PERMISSIONS.CATALOG_AVAILABILITY_WRITE,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_ACCEPT,
    PERMISSIONS.ORDERS_STATUS_WRITE,
    PERMISSIONS.CASH_SESSION_WRITE,
    PERMISSIONS.CASH_MOVEMENT_WRITE,
    PERMISSIONS.EXPENSES_CREATE,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.INVENTORY_READ,
  ],

  WAITER: [
    PERMISSIONS.ESTABLISHMENT_READ,
    PERMISSIONS.CATALOG_READ,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_ACCEPT,
    PERMISSIONS.ORDERS_STATUS_WRITE,
  ],

  KITCHEN: [
    PERMISSIONS.ESTABLISHMENT_READ,
    PERMISSIONS.CATALOG_READ,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_PREPARE,
    PERMISSIONS.INVENTORY_CONSUME,
  ],

  COURIER: [PERMISSIONS.ORDERS_READ, PERMISSIONS.ORDERS_DELIVER],

  ACCOUNTANT: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.ESTABLISHMENT_READ,
    PERMISSIONS.CATALOG_READ,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.EXPENSES_CREATE,
    PERMISSIONS.EXPENSES_APPROVE,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.REPORTS_MARGIN_READ,
    PERMISSIONS.INVENTORY_READ,
  ],
} as const;

export const PERMISSION_DESCRIPTIONS: Readonly<Record<PermissionCode, string>> = {
  [PERMISSIONS.ORGANIZATION_READ]: "Consulter les parametres de l'organisation",
  [PERMISSIONS.ORGANIZATION_WRITE]: "Modifier les parametres de l'organisation",
  [PERMISSIONS.ESTABLISHMENT_READ]: 'Consulter un etablissement',
  [PERMISSIONS.ESTABLISHMENT_WRITE]: 'Modifier la vitrine et les informations dun etablissement',
  [PERMISSIONS.ESTABLISHMENT_HOURS_WRITE]: 'Modifier les horaires et exceptions',
  [PERMISSIONS.ESTABLISHMENT_SUBMIT_VERIFICATION]: 'Soumettre un dossier de verification',
  [PERMISSIONS.MEMBER_READ]: "Consulter l'equipe",
  [PERMISSIONS.MEMBER_WRITE]: 'Inviter ou desactiver un employe',
  [PERMISSIONS.ROLE_ASSIGN]: 'Attribuer un role a un employe',
  [PERMISSIONS.CATALOG_READ]: 'Consulter le catalogue',
  [PERMISSIONS.CATALOG_MENU_WRITE]: 'Creer ou modifier un menu et ses categories',
  [PERMISSIONS.CATALOG_PRODUCT_WRITE]: 'Creer ou modifier un plat',
  [PERMISSIONS.CATALOG_PRICE_WRITE]: 'Modifier un prix',
  [PERMISSIONS.CATALOG_AVAILABILITY_WRITE]: 'Declarer une rupture ou une disponibilite',
  [PERMISSIONS.CATALOG_PUBLISH]: 'Publier un menu ou un plat',
  [PERMISSIONS.ORDERS_READ]: 'Consulter les commandes',
  [PERMISSIONS.ORDERS_ACCEPT]: 'Accepter une commande',
  [PERMISSIONS.ORDERS_REJECT]: 'Refuser une commande',
  [PERMISSIONS.ORDERS_STATUS_WRITE]: 'Faire avancer le statut dune commande',
  [PERMISSIONS.ORDERS_PREPARE]: 'Traiter la file de preparation',
  [PERMISSIONS.ORDERS_DELIVER]: 'Traiter une livraison assignee',
  [PERMISSIONS.CASH_SESSION_WRITE]: 'Ouvrir ou cloturer une session de caisse',
  [PERMISSIONS.CASH_MOVEMENT_WRITE]: 'Enregistrer une entree ou une sortie de caisse',
  [PERMISSIONS.EXPENSES_CREATE]: 'Enregistrer une depense',
  [PERMISSIONS.EXPENSES_APPROVE]: 'Valider une depense',
  [PERMISSIONS.PAYMENTS_REFUND]: 'Effectuer un remboursement',
  [PERMISSIONS.REPORTS_READ]: 'Consulter les rapports',
  [PERMISSIONS.REPORTS_MARGIN_READ]: 'Consulter la marge',
  [PERMISSIONS.INVENTORY_READ]: 'Consulter le stock',
  [PERMISSIONS.INVENTORY_WRITE]: 'Enregistrer un mouvement de stock',
  [PERMISSIONS.INVENTORY_CONSUME]: 'Declarer une consommation de stock',
};

export function permissionDomain(code: AnyPermissionCode): string {
  const [domain = 'unknown'] = code.split('.');
  return domain;
}
