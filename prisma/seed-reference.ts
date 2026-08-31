import type { PrismaClient } from '../src/infrastructure/prisma/generated/client';
import {
  PERMISSION_DESCRIPTIONS,
  PERMISSIONS,
  REAUTH_REQUIRED_PERMISSIONS,
  ROLE_PERMISSION_MATRIX,
  permissionDomain,
  type PermissionCode,
  type RoleCode,
} from '../src/common/auth/permissions';
import { MODULE_CODES } from '../src/domains/entitlements/module-codes';

/**
 * Donnees de reference de la plateforme : permissions, roles, allergenes, tags
 * et plans d'abonnement.
 *
 * Reference : specification sections 9.1, 26.2 et 30.
 *
 * Ce module est separe du seed de demonstration car les tests d'integration en
 * ont besoin sur une base vide : sans la matrice de roles en base, aucun acteur
 * ne peut etre resolu et toutes les routes authentifiees echoueraient.
 *
 * Toutes les operations sont des upserts : le seed est rejouable sans creer de
 * doublon, y compris apres l'ajout d'une permission.
 */

export const ROLE_LABELS: Record<RoleCode, { label: string; description: string }> = {
  OWNER: { label: 'Proprietaire', description: 'Acces complet a son organisation' },
  MANAGER: { label: 'Gerant', description: 'Exploitation quotidienne et equipe' },
  CASHIER: { label: 'Caissier', description: 'Caisse, encaissement et commandes' },
  WAITER: { label: 'Serveur', description: 'Prise de commande en salle' },
  KITCHEN: { label: 'Cuisine', description: 'File de preparation, sans acces financier' },
  COURIER: { label: 'Livreur', description: 'Livraisons assignees uniquement' },
  ACCOUNTANT: { label: 'Comptable', description: 'Lecture financiere et depenses' },
};

export const ALLERGENS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'PEANUT', label: 'Arachide' },
  { code: 'GLUTEN', label: 'Gluten' },
  { code: 'CRUSTACEAN', label: 'Crustaces' },
  { code: 'FISH', label: 'Poisson' },
  { code: 'EGG', label: 'Oeuf' },
  { code: 'MILK', label: 'Lait' },
  { code: 'SOY', label: 'Soja' },
  { code: 'SESAME', label: 'Sesame' },
  { code: 'MUSTARD', label: 'Moutarde' },
  { code: 'NUTS', label: 'Fruits a coque' },
];

export const CUISINE_TAGS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'IVOIRIAN', label: 'Ivoirien' },
  { code: 'MAQUIS', label: 'Maquis' },
  { code: 'GRILL', label: 'Grillades' },
  { code: 'WEST_AFRICAN', label: "Afrique de l'Ouest" },
  { code: 'FAST_FOOD', label: 'Restauration rapide' },
  { code: 'PASTRY', label: 'Patisserie' },
  { code: 'VEGETARIAN', label: 'Vegetarien' },
];

export const PLANS: ReadonlyArray<{
  code: string;
  label: string;
  description: string;
  trialDays: number;
  modules: string[];
}> = [
  {
    code: 'VITRINE',
    label: 'Vitrine',
    description: 'Presence en ligne : fiche, menu et horaires.',
    trialDays: 30,
    modules: [MODULE_CODES.STOREFRONT_BASIC, MODULE_CODES.CATALOG_ADVANCED],
  },
  {
    code: 'EXPLOITATION',
    label: 'Exploitation',
    description: 'Vitrine, commandes, caisse et depenses.',
    trialDays: 14,
    modules: [
      MODULE_CODES.STOREFRONT_BASIC,
      MODULE_CODES.CATALOG_ADVANCED,
      MODULE_CODES.ORDERS_MARKETPLACE,
      MODULE_CODES.ORDERS_MANUAL,
      MODULE_CODES.CASH_REGISTER,
      MODULE_CODES.FINANCE_EXPENSES,
      MODULE_CODES.INVENTORY_SIMPLE,
    ],
  },
  {
    code: 'COMPLET',
    label: 'Complet',
    description: 'Tous les modules, multi-etablissements inclus.',
    trialDays: 14,
    modules: Object.values(MODULE_CODES),
  },
];

export async function seedReferenceData(prisma: PrismaClient): Promise<void> {
  await seedPermissionsAndRoles(prisma);
  await seedAllergens(prisma);
  await seedPlatformTags(prisma);
  await seedPlans(prisma);
  await seedBillingCatalog(prisma);
}

/**
 * Les permissions et la matrice de roles sont derivees du code TypeScript.
 *
 * Une seule source pour la matrice evite qu'un role en base autorise une action
 * que le code ne connait pas, ou l'inverse (specification section 9.1).
 */
async function seedPermissionsAndRoles(prisma: PrismaClient): Promise<void> {
  const permissionCodes = Object.values(PERMISSIONS) as PermissionCode[];

  for (const code of permissionCodes) {
    await prisma.permission.upsert({
      where: { code },
      create: {
        code,
        domain: permissionDomain(code),
        description: PERMISSION_DESCRIPTIONS[code],
        requiresReauth: REAUTH_REQUIRED_PERMISSIONS.has(code),
      },
      update: {
        domain: permissionDomain(code),
        description: PERMISSION_DESCRIPTIONS[code],
        requiresReauth: REAUTH_REQUIRED_PERMISSIONS.has(code),
      },
    });
  }

  const permissions = await prisma.permission.findMany({ select: { id: true, code: true } });
  const permissionIdByCode = new Map(permissions.map((entry) => [entry.code, entry.id]));

  for (const [roleCode, grantedPermissions] of Object.entries(ROLE_PERMISSION_MATRIX)) {
    const labels = ROLE_LABELS[roleCode as RoleCode];

    const role = await prisma.role.upsert({
      where: { code: roleCode },
      create: { code: roleCode, label: labels.label, description: labels.description },
      update: { label: labels.label, description: labels.description },
      select: { id: true },
    });

    const expectedIds = new Set(
      grantedPermissions
        .map((code) => permissionIdByCode.get(code))
        .filter((id): id is string => id !== undefined),
    );

    // Les permissions retirees de la matrice sont revoquees : sans ce nettoyage,
    // un role conserverait indefiniment un droit supprime du code.
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: [...expectedIds] } },
    });

    for (const permissionId of expectedIds) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        create: { roleId: role.id, permissionId },
        update: {},
      });
    }
  }
}

async function seedAllergens(prisma: PrismaClient): Promise<void> {
  for (const allergen of ALLERGENS) {
    await prisma.allergen.upsert({
      where: { code: allergen.code },
      create: allergen,
      update: { label: allergen.label },
    });
  }
}

async function seedPlatformTags(prisma: PrismaClient): Promise<void> {
  for (const tag of CUISINE_TAGS) {
    const existing = await prisma.tag.findFirst({
      where: { code: tag.code, organizationId: null },
      select: { id: true },
    });

    if (existing) {
      await prisma.tag.update({ where: { id: existing.id }, data: { label: tag.label } });
      continue;
    }

    await prisma.tag.create({ data: { code: tag.code, label: tag.label } });
  }
}

async function seedPlans(prisma: PrismaClient): Promise<void> {
  for (const plan of PLANS) {
    const created = await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      create: {
        code: plan.code,
        label: plan.label,
        description: plan.description,
        trialDays: plan.trialDays,
        // Tarification non arretee (specification section 36) : le montant reste
        // a zero jusqu'a decision commerciale ecrite.
        monthlyPriceAmount: 0n,
      },
      update: { label: plan.label, description: plan.description, trialDays: plan.trialDays },
      select: { id: true },
    });

    await prisma.planModule.deleteMany({
      where: { planId: created.id, moduleCode: { notIn: plan.modules } },
    });

    for (const moduleCode of plan.modules) {
      await prisma.planModule.upsert({
        where: { planId_moduleCode: { planId: created.id, moduleCode } },
        create: { planId: created.id, moduleCode },
        update: {},
      });
    }
  }
}

async function seedBillingCatalog(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO platform_billing (id, currency, published, notice)
    VALUES (1, 'XOF', FALSE, '')
    ON CONFLICT (id) DO NOTHING
  `;

  await prisma.$executeRaw`
    INSERT INTO module_prices (module_code, label, included, sort_order, monthly_price_amount)
    VALUES
      ('storefront.basic', 'Vitrine', TRUE, 10, 0),
      ('catalog.advanced', 'Catalogue avance', FALSE, 20, 0),
      ('orders.marketplace', 'Commandes en ligne', FALSE, 30, 0),
      ('orders.manual', 'Commandes de salle', FALSE, 40, 0),
      ('reservations.tables', 'Reservation de tables', FALSE, 50, 0),
      ('payments.online', 'Paiement en ligne', FALSE, 60, 0),
      ('cash.register', 'Caisse', FALSE, 70, 0),
      ('finance.expenses', 'Depenses', FALSE, 80, 0),
      ('finance.credits', 'Credits et dettes', FALSE, 90, 0),
      ('inventory.simple', 'Stock simple', FALSE, 100, 0),
      ('inventory.ingredients', 'Stock par ingredients', FALSE, 110, 0),
      ('delivery.internal', 'Livraison interne', FALSE, 120, 0),
      ('marketing.promotions', 'Promotions', FALSE, 130, 0),
      ('analytics.advanced', 'Statistiques avancees', FALSE, 140, 0),
      ('organization.multisite', 'Multi-etablissements', FALSE, 150, 0)
    ON CONFLICT (module_code) DO NOTHING
  `;
}
