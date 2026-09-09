import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequirePermissions } from '../../common/auth/auth.decorators';
import { PLATFORM_PERMISSIONS } from '../../common/auth/permissions';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
@Controller({ version: '1', path: 'admin/operations' })
export class OperationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  @Get()
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_AUDIT_READ)
  async status() {
    const [push, outbox] = await Promise.all([
      this.prisma.$queryRaw<Array<{ status: string; count: number; overdue: number }>>`
        SELECT status,count(*)::int AS count,count(*) FILTER(WHERE status IN ('PENDING','PROCESSING','CHECKING') AND next_attempt_at<now()-interval '15 minutes')::int AS overdue FROM push_deliveries GROUP BY status`,
      this.prisma.$queryRaw<Array<{ status: string; count: number; overdue: number }>>`
        SELECT status,count(*)::int AS count,count(*) FILTER(WHERE status IN ('PENDING','PROCESSING','FAILED') AND available_at<now()-interval '15 minutes')::int AS overdue FROM outbox_events GROUP BY status`,
    ]);
    return {
      pushEnabled: String(this.config.get('PUSH_ENABLED')) === 'true',
      smsProvider: this.config.get<string>('SMS_PROVIDER'),
      otpEchoEnabled: String(this.config.get('OTP_DEV_ECHO_CODE')) === 'true',
      push,
      outbox,
      healthy: !push.some((row) => row.overdue > 0) && !outbox.some((row) => row.overdue > 0),
    };
  }
}
