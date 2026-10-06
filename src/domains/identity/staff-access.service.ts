import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../common/config/app-config.service';
import { constantTimeEquals } from '../../common/security/hashing';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/**
 * Protection des comptes du personnel de la plateforme.
 *
 * Reference : specification section 22.
 *
 * Un compte interne ouvre le back-office : verification des restaurants,
 * remboursements, moderation, tarifs. Deux regles s'appliquent a ces comptes,
 * quel que soit l'environnement :
 *
 *  1. leur code de connexion n'est jamais renvoye dans la reponse HTTP sans le
 *     code d'acces du personnel, meme lorsque l'echo de developpement est actif ;
 *  2. lorsque `STAFF_ACCESS_CODE` est configure, la connexion exige ce code en
 *     plus du code recu par SMS.
 */
@Injectable()
export class StaffAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  get configured(): boolean {
    return this.config.staffAccessCode !== undefined;
  }

  async isStaffPhone(phoneE164: string): Promise<boolean> {
    const staff = await this.prisma.platformStaff.findFirst({
      where: { revokedAt: null, user: { phoneE164 } },
      select: { id: true },
    });
    return staff !== null;
  }

  /** Comparaison a temps constant : la duree de la reponse ne revele rien du code attendu. */
  matches(candidate: string | undefined): boolean {
    const expected = this.config.staffAccessCode;
    if (expected === undefined || candidate === undefined || candidate.length === 0) {
      return false;
    }
    return constantTimeEquals(Buffer.from(candidate, 'utf8'), Buffer.from(expected, 'utf8'));
  }
}
