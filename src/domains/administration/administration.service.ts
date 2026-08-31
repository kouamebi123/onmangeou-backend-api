import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain.error';
import { Clock } from '../../common/time/clock';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { buildPage, decodeCursor, normalizePageSize, type PageResult } from '../../common/pagination/cursor';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import type { AdminListQuery } from './dto/admin.dto';

export interface VerificationCaseView {
  id: string;
  status: string;
  organizationId: string;
  organizationName: string;
  establishmentId: string | null;
  establishmentName: string | null;
  establishmentSlug: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  decisionReason: string | null;
}

export interface AdminEstablishmentView {
  id: string;
  name: string;
  slug: string;
  status: string;
  city: string;
  district: string | null;
  organizationId: string;
  organizationName: string;
  verifiedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface AdminUserView {
  id: string;
  phoneE164: string;
  fullName: string | null;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  organizationNames: string[];
}

export interface AdminAuditView {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  organizationId: string | null;
  actorUserId: string | null;
  reason: string | null;
  occurredAt: string;
}

/**
 * Actions internes de la plateforme (specification sections 3.4 et 31).
 *
 * Le tenant n'est jamais lu depuis la requete : un administrateur voit tous les
 * etablissements, et chaque decision est auditee. Le journal d'audit n'est jamais
 * modifiable depuis ici.
 */
@Injectable()
export class AdministrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditService,
  ) {}

  async listVerificationCases(query: AdminListQuery): Promise<PageResult<VerificationCaseView>> {
    const limit = normalizePageSize(query.limit);
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);

    const rows = await this.prisma.verificationCase.findMany({
      where: {
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(cursor === undefined
          ? {}
          : {
              OR: [
                { submittedAt: { lt: new Date(cursor.sortValue) } },
                { submittedAt: new Date(cursor.sortValue), id: { lt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        status: true,
        organizationId: true,
        establishmentId: true,
        submittedAt: true,
        reviewedAt: true,
        decisionReason: true,
        organization: { select: { name: true } },
        establishment: { select: { name: true, slug: true } },
      },
    });

    const page = buildPage(rows, limit, (row) => ({
      sortValue: row.submittedAt.toISOString(),
      id: row.id,
    }));

    return { items: page.items.map(toVerificationView), nextCursor: page.nextCursor };
  }

  async decideVerification(
    actor: AuthenticatedActor,
    caseId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason: string,
    context: { requestId: string },
  ): Promise<VerificationCaseView> {
    const current = await this.prisma.verificationCase.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        status: true,
        organizationId: true,
        establishmentId: true,
      },
    });

    if (!current) {
      throw new DomainError('NOT_FOUND', `Dossier de verification ${caseId} introuvable`);
    }

    if (current.status === 'APPROVED' || current.status === 'REJECTED') {
      throw new DomainError('CONFLICT', `Dossier deja statue : ${current.status}`, {
        publicDetail: 'Ce dossier a deja recu une decision.',
      });
    }

    const now = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      await tx.verificationCase.update({
        where: { id: caseId },
        data: {
          status: decision,
          reviewedAt: now,
          reviewedByUserId: actor.userId,
          decisionReason: reason,
        },
      });

      if (decision === 'APPROVED') {
        await tx.organization.update({
          where: { id: current.organizationId },
          data: { status: 'VERIFIED' },
        });

        if (current.establishmentId !== null) {
          await tx.establishment.update({
            where: { id: current.establishmentId },
            data: { verifiedAt: now },
          });
        }
      }

      await this.audit.recordForActor(
        actor,
        {
          action: AUDIT_ACTIONS.ESTABLISHMENT_VERIFICATION_DECIDED,
          resourceType: 'verification_case',
          resourceId: caseId,
          organizationId: current.organizationId,
          reason,
          requestId: context.requestId,
          after: { decision },
        },
        tx,
      );
    });

    const updated = await this.prisma.verificationCase.findUniqueOrThrow({
      where: { id: caseId },
      select: {
        id: true,
        status: true,
        organizationId: true,
        establishmentId: true,
        submittedAt: true,
        reviewedAt: true,
        decisionReason: true,
        organization: { select: { name: true } },
        establishment: { select: { name: true, slug: true } },
      },
    });

    return toVerificationView(updated);
  }

  async listEstablishments(query: AdminListQuery): Promise<PageResult<AdminEstablishmentView>> {
    const limit = normalizePageSize(query.limit);
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);

    const rows = await this.prisma.establishment.findMany({
      where: {
        deletedAt: null,
        ...(query.establishmentStatus === undefined ? {} : { status: query.establishmentStatus }),
        ...(cursor === undefined
          ? {}
          : {
              OR: [
                { createdAt: { lt: new Date(cursor.sortValue) } },
                { createdAt: new Date(cursor.sortValue), id: { lt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        city: true,
        district: true,
        organizationId: true,
        verifiedAt: true,
        publishedAt: true,
        createdAt: true,
        organization: { select: { name: true } },
      },
    });

    const page = buildPage(rows, limit, (row) => ({
      sortValue: row.createdAt.toISOString(),
      id: row.id,
    }));

    return {
      items: page.items.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        city: row.city,
        district: row.district,
        organizationId: row.organizationId,
        organizationName: row.organization.name,
        verifiedAt: row.verifiedAt?.toISOString() ?? null,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  async listUsers(query: AdminListQuery): Promise<PageResult<AdminUserView>> {
    const limit = normalizePageSize(query.limit);
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);

    const rows = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(cursor === undefined
          ? {}
          : {
              OR: [
                { createdAt: { lt: new Date(cursor.sortValue) } },
                { createdAt: new Date(cursor.sortValue), id: { lt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        phoneE164: true,
        fullName: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        memberships: {
          where: { status: 'ACTIVE', revokedAt: null },
          select: { organization: { select: { name: true } } },
        },
      },
    });

    const page = buildPage(rows, limit, (row) => ({
      sortValue: row.createdAt.toISOString(),
      id: row.id,
    }));

    return {
      items: page.items.map((row) => ({
        id: row.id,
        phoneE164: row.phoneE164,
        fullName: row.fullName,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
        organizationNames: row.memberships.map((membership) => membership.organization.name),
      })),
      nextCursor: page.nextCursor,
    };
  }

  async listAuditLogs(query: AdminListQuery): Promise<PageResult<AdminAuditView>> {
    const limit = normalizePageSize(query.limit);
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);

    const rows = await this.prisma.auditLog.findMany({
      where:
        cursor === undefined
          ? {}
          : {
              OR: [
                { occurredAt: { lt: new Date(cursor.sortValue) } },
                { occurredAt: new Date(cursor.sortValue), id: { lt: cursor.id } },
              ],
            },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        organizationId: true,
        actorUserId: true,
        reason: true,
        occurredAt: true,
      },
    });

    const page = buildPage(rows, limit, (row) => ({
      sortValue: row.occurredAt.toISOString(),
      id: row.id,
    }));

    return {
      items: page.items.map((row) => ({
        id: row.id,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        organizationId: row.organizationId,
        actorUserId: row.actorUserId,
        reason: row.reason,
        occurredAt: row.occurredAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }
}

function toVerificationView(row: {
  id: string;
  status: string;
  organizationId: string;
  establishmentId: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  decisionReason: string | null;
  organization: { name: string };
  establishment: { name: string; slug: string } | null;
}): VerificationCaseView {
  return {
    id: row.id,
    status: row.status,
    organizationId: row.organizationId,
    organizationName: row.organization.name,
    establishmentId: row.establishmentId,
    establishmentName: row.establishment?.name ?? null,
    establishmentSlug: row.establishment?.slug ?? null,
    submittedAt: row.submittedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    decisionReason: row.decisionReason,
  };
}
