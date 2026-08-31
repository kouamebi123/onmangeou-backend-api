import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum AppEnvironment {
  Local = 'local',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

const toBoolean = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    return false;
  });

const toStringList = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      : [],
  );

/**
 * Contrat de configuration du backend (specification section 26).
 *
 * La validation est executee au demarrage : un service mal configure doit
 * refuser de demarrer plutot que d'echouer silencieusement en production.
 */
export class EnvironmentSchema {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @IsEnum(AppEnvironment)
  APP_ENV: AppEnvironment = AppEnvironment.Local;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  API_BASE_URL!: string;

  @IsString()
  LOG_LEVEL = 'info';

  @toStringList()
  @IsString({ each: true })
  CORS_ALLOWED_ORIGINS: string[] = [];

  /**
   * Nombre de reverse proxies de confiance devant l'API.
   *
   * La limitation de debit repose sur `request.ip` : une valeur trop elevee
   * permettrait a un client de forger son adresse via `X-Forwarded-For`, une
   * valeur trop faible comptabiliserait tout le trafic sur l'IP du proxy.
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY_HOPS = 1;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  DATABASE_POOL_MAX = 10;

  @Type(() => Number)
  @IsInt()
  @Min(500)
  DATABASE_CONNECTION_TIMEOUT_MS = 5000;

  @IsString()
  @IsNotEmpty()
  REDIS_URL!: string;

  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  S3_BUCKET?: string;

  @IsOptional()
  @IsString()
  S3_REGION?: string;

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  S3_SECRET_ACCESS_KEY?: string;

  @toBoolean()
  @IsBoolean()
  S3_FORCE_PATH_STYLE = true;

  @IsOptional()
  @IsString()
  S3_PUBLIC_BASE_URL?: string;

  @IsString()
  @IsNotEmpty()
  MEDIA_STORAGE_DRIVER = 'local';

  @IsString()
  @IsNotEmpty()
  MEDIA_LOCAL_ROOT = '/data/uploads';

  @IsOptional()
  @IsString()
  MEDIA_PUBLIC_BASE_URL?: string;

  @IsUrl({ require_tld: false })
  JWT_ISSUER!: string;

  @IsString()
  @IsNotEmpty()
  JWT_AUDIENCE!: string;

  /** Cle privee ES256 encodee en base64 (PEM PKCS8). */
  @IsString()
  @MinLength(64)
  JWT_PRIVATE_KEY!: string;

  /** Cle publique ES256 encodee en base64 (PEM SPKI). */
  @IsString()
  @MinLength(64)
  JWT_PUBLIC_KEY!: string;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(3600)
  JWT_ACCESS_TOKEN_TTL_SECONDS = 900;

  @Type(() => Number)
  @IsInt()
  @Min(3600)
  JWT_REFRESH_TOKEN_TTL_SECONDS = 2_592_000;

  @Type(() => Number)
  @IsInt()
  @Min(4)
  @Max(8)
  OTP_CODE_LENGTH = 6;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(1800)
  OTP_TTL_SECONDS = 300;

  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(10)
  OTP_MAX_ATTEMPTS = 5;

  @IsString()
  @MinLength(16)
  OTP_PEPPER!: string;

  @toBoolean()
  @IsBoolean()
  OTP_DEV_ECHO_CODE = false;

  @IsString()
  @IsNotEmpty()
  PAYMENT_PROVIDER = 'sandbox';

  @IsOptional()
  @IsString()
  PAYMENT_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  MAP_TILES_URL?: string;

  @IsOptional()
  @IsString()
  MAP_API_KEY?: string;

  @IsString()
  SMS_PROVIDER = 'console';

  @IsString()
  SMS_SENDER_ID = 'OnMangeOu';

  @IsOptional()
  @IsString()
  SENTRY_DSN?: string;

  @IsOptional()
  @IsString()
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;

  @IsString()
  OTEL_SERVICE_NAME = 'onmangeou-backend-api';

  @toBoolean()
  @IsBoolean()
  RATE_LIMIT_ENABLED = true;
}

export function validateEnvironment(raw: Record<string, unknown>): EnvironmentSchema {
  const parsed = plainToInstance(EnvironmentSchema, raw, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
    excludeExtraneousValues: false,
  });

  const errors = validateSync(parsed, { skipMissingProperties: false, whitelist: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
      .join('\n  - ');
    throw new Error(`Configuration invalide (specification section 26) :\n  - ${details}`);
  }

  assertProductionSafety(parsed);

  return parsed;
}

/**
 * Garde-fous non negociables hors developpement.
 *
 * Le renvoi du code OTP dans la reponse HTTP est une commodite locale. En
 * staging ou en production, il equivaudrait a publier un facteur
 * d'authentification (specification sections 22 et 26).
 */
function assertProductionSafety(config: EnvironmentSchema): void {
  const isProtectedEnvironment =
    config.APP_ENV === AppEnvironment.Staging || config.APP_ENV === AppEnvironment.Production;

  if (!isProtectedEnvironment) {
    return;
  }

  const violations: string[] = [];

  if (config.OTP_DEV_ECHO_CODE) {
    violations.push('OTP_DEV_ECHO_CODE doit etre desactive');
  }

  if (config.PAYMENT_PROVIDER === 'sandbox' && config.APP_ENV === AppEnvironment.Production) {
    violations.push("PAYMENT_PROVIDER ne peut pas rester 'sandbox' en production");
  }

  if (!config.PAYMENT_WEBHOOK_SECRET) {
    violations.push('PAYMENT_WEBHOOK_SECRET est obligatoire pour verifier les signatures');
  }

  if (config.CORS_ALLOWED_ORIGINS.length === 0) {
    violations.push('CORS_ALLOWED_ORIGINS doit lister explicitement les origines autorisees');
  }

  if (violations.length > 0) {
    throw new Error(
      `Configuration interdite pour APP_ENV=${config.APP_ENV} :\n  - ${violations.join('\n  - ')}`,
    );
  }
}
