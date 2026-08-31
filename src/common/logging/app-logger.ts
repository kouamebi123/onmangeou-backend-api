import pino, { type Logger as PinoLogger } from 'pino';

export const APP_LOGGER = Symbol('APP_LOGGER');

export type LogContext = Record<string, unknown>;

/**
 * Journalisation structuree JSON (specification section 25.1).
 *
 * Chaque entree porte `requestId`, `userId` pseudonymise, tenant, domaine et
 * duree lorsque l'information est disponible.
 */
export interface AppLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(bindings: LogContext): AppLogger;
}

/**
 * Champs interdits dans les journaux.
 *
 * Un journal ne contient jamais de code OTP, de jeton, de PIN Mobile Money, de
 * donnee de carte ni de document brut (specification section 22).
 */
const REDACTED_PATHS = [
  'code',
  'otp',
  'otpCode',
  'password',
  'pin',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cardNumber',
  'cvv',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["idempotency-key"]',
  'req.body.code',
  'req.body.password',
  '*.code',
  '*.token',
  '*.secret',
];

export function createRootLogger(options: {
  level: string;
  serviceName: string;
  pretty: boolean;
}): AppLogger {
  const logger = pino({
    level: options.level,
    base: { service: options.serviceName },
    redact: { paths: REDACTED_PATHS, censor: '[expurge]' },
    // Les horodatages sont en UTC ISO 8601 (principe non negociable 5).
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    ...(options.pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service' },
          },
        }
      : {}),
  });

  return wrap(logger);
}

function wrap(logger: PinoLogger): AppLogger {
  return {
    debug: (message, context) => logger.debug(context ?? {}, message),
    info: (message, context) => logger.info(context ?? {}, message),
    warn: (message, context) => logger.warn(context ?? {}, message),
    error: (message, context) => logger.error(context ?? {}, message),
    child: (bindings) => wrap(logger.child(bindings)),
  };
}

/** Journal silencieux pour les tests unitaires. */
export function createNullLogger(): AppLogger {
  const noop = (): void => undefined;
  const instance: AppLogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => instance,
  };
  return instance;
}
