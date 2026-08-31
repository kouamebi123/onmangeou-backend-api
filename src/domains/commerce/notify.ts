import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';

export async function notifyUser(
  prisma: PrismaService,
  userId: string,
  kind: string,
  title: string,
  body: string,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO notifications (id, user_id, title, body, kind, created_at)
    VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${title}, ${body}, ${kind}, NOW())
  `;
}
