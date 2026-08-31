import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DomainError } from '../errors/domain.error';
import type { AuthenticatedActor } from './authenticated-actor';

/**
 * Garde-fou multi-tenant.
 *
 * Reference : specification sections 4.4 et 8.3.
 *
 * Toute lecture ou ecriture professionnelle passe par ce service : il refuse un
 * etablissement qui n'appartient pas a l'organisation de l'acteur, ou auquel le
 * membre n'est pas affecte. Le scenario obligatoire numero 5 de la section 28.2
 * repose sur ce point.
 */
@Injectable()
export class TenantScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Organisation active de l'acteur, ou refus si l'acteur n'est pas un membre. */
  requireOrganization(actor: AuthenticatedActor): string {
    if (!actor.organizationId) {
      throw new DomainError('FORBIDDEN', 'Aucune organisation active sur cette session');
    }
    return actor.organizationId;
  }

  /**
   * Verifie qu'un etablissement est bien dans le perimetre de l'acteur.
   *
   * Deux controles, volontairement redondants :
   *  1. l'etablissement appartient a l'organisation de l'acteur ;
   *  2. le membre est explicitement affecte a cet etablissement.
   *
   * Le second controle est celui qui distingue un gerant multisite d'un caissier
   * affecte a une seule adresse.
   */
  async assertEstablishmentInScope(
    actor: AuthenticatedActor,
    establishmentId: string,
  ): Promise<{ organizationId: string; establishmentId: string }> {
    const organizationId = this.requireOrganization(actor);

    const establishment = await this.prisma.establishment.findFirst({
      where: { id: establishmentId, organizationId, deletedAt: null },
      select: { id: true, organizationId: true },
    });

    if (!establishment) {
      // Un etablissement hors tenant est traite comme inexistant : repondre
      // "non autorise" revelerait son existence (specification section 22).
      throw new DomainError('NOT_FOUND', `Etablissement ${establishmentId} hors du tenant ${organizationId}`);
    }

    if (!actor.establishmentIds.includes(establishmentId)) {
      throw new DomainError('FORBIDDEN', `Membre non affecte a l'etablissement ${establishmentId}`);
    }

    return { organizationId, establishmentId };
  }

  /** Filtre Prisma reutilisable pour restreindre une lecture au tenant. */
  organizationFilter(actor: AuthenticatedActor): { organizationId: string } {
    return { organizationId: this.requireOrganization(actor) };
  }
}
