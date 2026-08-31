import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  REAUTH_REQUIRED_PERMISSIONS,
  ROLE_PERMISSION_MATRIX,
  permissionDomain,
  type PermissionCode,
} from '../../src/common/auth/permissions';
import {
  actorCoversEstablishment,
  actorHasPermission,
} from '../../src/common/auth/authenticated-actor';
import type { AuthenticatedActor } from '../../src/common/auth/authenticated-actor';

/**
 * La matrice de roles est la transcription du tableau de la section 9.1 de la
 * specification. Ces tests figent les interdits, en particulier ceux du scenario
 * obligatoire 10 : le role cuisine n'accede jamais a la marge.
 */
describe('matrice de roles', () => {
  it('le proprietaire dispose de toutes les permissions', () => {
    const all = Object.values(PERMISSIONS);
    expect(ROLE_PERMISSION_MATRIX.OWNER).toHaveLength(all.length);
  });

  it('le role cuisine ne voit pas la marge', () => {
    expect(ROLE_PERMISSION_MATRIX.KITCHEN).not.toContain(PERMISSIONS.REPORTS_MARGIN_READ);
    expect(ROLE_PERMISSION_MATRIX.KITCHEN).not.toContain(PERMISSIONS.REPORTS_READ);
  });

  it('le role cuisine ne modifie pas le catalogue, conformement a la matrice', () => {
    expect(ROLE_PERMISSION_MATRIX.KITCHEN).toContain(PERMISSIONS.CATALOG_READ);
    expect(ROLE_PERMISSION_MATRIX.KITCHEN).not.toContain(PERMISSIONS.CATALOG_PRICE_WRITE);
    expect(ROLE_PERMISSION_MATRIX.KITCHEN).not.toContain(PERMISSIONS.CATALOG_PRODUCT_WRITE);
  });

  it('le serveur ne rembourse pas et ne touche pas a la caisse', () => {
    expect(ROLE_PERMISSION_MATRIX.WAITER).not.toContain(PERMISSIONS.PAYMENTS_REFUND);
    expect(ROLE_PERMISSION_MATRIX.WAITER).not.toContain(PERMISSIONS.CASH_SESSION_WRITE);
  });

  it('le livreur est limite aux commandes qui lui sont assignees', () => {
    expect(ROLE_PERMISSION_MATRIX.COURIER).toEqual([
      PERMISSIONS.ORDERS_READ,
      PERMISSIONS.ORDERS_DELIVER,
    ]);
  });

  it('le comptable lit la marge mais ne modifie pas le catalogue', () => {
    expect(ROLE_PERMISSION_MATRIX.ACCOUNTANT).toContain(PERMISSIONS.REPORTS_MARGIN_READ);
    expect(ROLE_PERMISSION_MATRIX.ACCOUNTANT).not.toContain(PERMISSIONS.CATALOG_PRODUCT_WRITE);
  });

  it('le caissier ne gere pas les roles', () => {
    expect(ROLE_PERMISSION_MATRIX.CASHIER).not.toContain(PERMISSIONS.ROLE_ASSIGN);
  });

  it('chaque permission possede une description exploitable dans l interface', () => {
    for (const code of Object.values(PERMISSIONS)) {
      expect(PERMISSION_DESCRIPTIONS[code]).toBeTruthy();
    }
  });

  it('aucun role ne reference une permission inconnue', () => {
    const known = new Set<string>(Object.values(PERMISSIONS));

    for (const permissions of Object.values(ROLE_PERMISSION_MATRIX)) {
      for (const permission of permissions) {
        expect(known.has(permission)).toBe(true);
      }
    }
  });
});

describe('permissions sensibles', () => {
  it('le remboursement et la gestion des roles exigent une reauthentification', () => {
    expect(REAUTH_REQUIRED_PERMISSIONS.has(PERMISSIONS.PAYMENTS_REFUND)).toBe(true);
    expect(REAUTH_REQUIRED_PERMISSIONS.has(PERMISSIONS.ROLE_ASSIGN)).toBe(true);
  });

  it('une simple lecture n exige pas de reauthentification', () => {
    expect(REAUTH_REQUIRED_PERMISSIONS.has(PERMISSIONS.CATALOG_READ)).toBe(false);
  });
});

describe('permissionDomain', () => {
  it('extrait le domaine du code atomique', () => {
    expect(permissionDomain(PERMISSIONS.ORDERS_ACCEPT)).toBe('orders');
    expect(permissionDomain(PERMISSIONS.REPORTS_MARGIN_READ)).toBe('reports');
  });
});

describe('helpers d acteur', () => {
  const actor: AuthenticatedActor = {
    userId: 'user-1',
    sessionId: 'session-1',
    organizationId: 'org-1',
    establishmentIds: ['est-1', 'est-2'],
    permissions: new Set<string>([PERMISSIONS.CATALOG_READ]),
  };

  it('reconnait une permission accordee', () => {
    expect(actorHasPermission(actor, PERMISSIONS.CATALOG_READ as PermissionCode)).toBe(true);
  });

  it('refuse une permission absente', () => {
    expect(actorHasPermission(actor, PERMISSIONS.CATALOG_PRICE_WRITE as PermissionCode)).toBe(false);
  });

  it('reconnait un etablissement du perimetre', () => {
    expect(actorCoversEstablishment(actor, 'est-1')).toBe(true);
  });

  it('refuse un etablissement hors perimetre', () => {
    expect(actorCoversEstablishment(actor, 'est-9')).toBe(false);
  });
});
