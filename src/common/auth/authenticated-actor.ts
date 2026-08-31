/**
 * Identite resolue cote serveur pour la requete en cours.
 *
 * Reference : specification sections 4.4 et 9.2.
 *
 * Le tenant et les permissions sont toujours derives du jeton et de la base,
 * jamais d'un champ du corps de la requete.
 */
export interface AuthenticatedActor {
  userId: string;
  sessionId: string;

  /** Organisation active, absente pour un client particulier. */
  organizationId?: string;

  /** Etablissements auxquels le membre est explicitement affecte. */
  establishmentIds: string[];

  roleCode?: string;

  /** Role interne de la plateforme, absent pour un client ou un restaurant. */
  platformRole?: 'ADMIN' | 'SUPPORT';

  /** Permissions atomiques effectives, par exemple `catalog.product.write`. */
  permissions: ReadonlySet<string>;

  /** Instant de la derniere authentification forte, pour les actions sensibles. */
  mfaSatisfiedAt?: Date;

  deviceInstallId?: string;
}

export function actorHasPermission(actor: AuthenticatedActor, permission: string): boolean {
  return actor.permissions.has(permission);
}

/**
 * Verifie qu'un membre est bien affecte a l'etablissement cible.
 *
 * Un membre ne peut acceder qu'aux etablissements qui lui sont attribues
 * (specification section 8.3).
 */
export function actorCoversEstablishment(actor: AuthenticatedActor, establishmentId: string): boolean {
  return actor.establishmentIds.includes(establishmentId);
}
