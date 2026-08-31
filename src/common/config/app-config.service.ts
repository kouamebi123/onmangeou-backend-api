import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnvironment, type EnvironmentSchema, NodeEnvironment } from './environment.schema';

/**
 * Acces type a la configuration validee. Aucun service de domaine ne lit
 * `process.env` directement.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<EnvironmentSchema, true>) {}

  private get<K extends keyof EnvironmentSchema>(key: K): EnvironmentSchema[K] {
    return this.config.get(key, { infer: true });
  }

  get appEnv(): AppEnvironment {
    return this.get('APP_ENV');
  }

  get nodeEnv(): NodeEnvironment {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.appEnv === AppEnvironment.Production;
  }

  get isLocal(): boolean {
    return this.appEnv === AppEnvironment.Local;
  }

  get port(): number {
    return this.get('PORT');
  }

  get apiBaseUrl(): string {
    return this.get('API_BASE_URL');
  }

  get logLevel(): string {
    return this.get('LOG_LEVEL');
  }

  get corsAllowedOrigins(): string[] {
    return this.get('CORS_ALLOWED_ORIGINS');
  }

  get trustProxyHops(): number {
    return this.get('TRUST_PROXY_HOPS');
  }

  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  get databasePoolMax(): number {
    return this.get('DATABASE_POOL_MAX');
  }

  get databaseConnectionTimeoutMs(): number {
    return this.get('DATABASE_CONNECTION_TIMEOUT_MS');
  }

  get redisUrl(): string {
    return this.get('REDIS_URL');
  }

  get jwt(): {
    issuer: string;
    audience: string;
    privateKey: string;
    publicKey: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
  } {
    return {
      issuer: this.get('JWT_ISSUER'),
      audience: this.get('JWT_AUDIENCE'),
      privateKey: decodeBase64Pem(this.get('JWT_PRIVATE_KEY')),
      publicKey: decodeBase64Pem(this.get('JWT_PUBLIC_KEY')),
      accessTokenTtlSeconds: this.get('JWT_ACCESS_TOKEN_TTL_SECONDS'),
      refreshTokenTtlSeconds: this.get('JWT_REFRESH_TOKEN_TTL_SECONDS'),
    };
  }

  get otp(): {
    codeLength: number;
    ttlSeconds: number;
    maxAttempts: number;
    pepper: string;
    devEchoCode: boolean;
  } {
    return {
      codeLength: this.get('OTP_CODE_LENGTH'),
      ttlSeconds: this.get('OTP_TTL_SECONDS'),
      maxAttempts: this.get('OTP_MAX_ATTEMPTS'),
      pepper: this.get('OTP_PEPPER'),
      devEchoCode: this.get('OTP_DEV_ECHO_CODE'),
    };
  }

  get smsProvider(): string {
    return this.get('SMS_PROVIDER');
  }

  get smsSenderId(): string {
    return this.get('SMS_SENDER_ID');
  }

  get rateLimitEnabled(): boolean {
    return this.get('RATE_LIMIT_ENABLED');
  }

  get otelServiceName(): string {
    return this.get('OTEL_SERVICE_NAME');
  }

  get sentryDsn(): string | undefined {
    return this.get('SENTRY_DSN');
  }

  get media(): { driver: string; localRoot: string; publicBaseUrl: string } {
    return {
      driver: this.get('MEDIA_STORAGE_DRIVER'),
      localRoot: this.get('MEDIA_LOCAL_ROOT'),
      publicBaseUrl:
        this.get('MEDIA_PUBLIC_BASE_URL') ?? `${this.apiBaseUrl.replace(/\/$/, '')}/api/v1/media`,
    };
  }
}

/**
 * Les cles PEM sont multilignes : elles sont transportees en base64 pour rester
 * compatibles avec tous les gestionnaires de variables d'environnement.
 */
function decodeBase64Pem(value: string): string {
  if (value.includes('-----BEGIN')) {
    return value;
  }
  return Buffer.from(value, 'base64').toString('utf8');
}
