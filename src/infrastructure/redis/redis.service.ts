import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../../common/config/app-config.service';
import { APP_LOGGER, type AppLogger } from '../../common/logging/app-logger';

/**
 * Acces Redis pour le cache, les verrous courts et la limitation de debit
 * (specification sections 4.2 et 10.1).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(
    config: AppConfigService,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {
    this.client = new Redis(config.redisUrl, {
      // Une commande qui echoue ne doit pas bloquer une requete HTTP :
      // la degradation est controlee (specification section 24.2).
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    });

    this.client.on('error', (error: Error) => {
      this.logger.error('Erreur Redis', { detail: error.message });
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }

  /**
   * Compteur a fenetre glissante pour la limitation de debit.
   *
   * L'increment et l'expiration sont executes dans une transaction Redis :
   * sans cela, un incident entre les deux commandes creerait une cle sans
   * expiration, bloquant definitivement l'appelant.
   */
  async incrementWithWindow(key: string, windowSeconds: number): Promise<{ count: number; ttlSeconds: number }> {
    const results = await this.client.multi().incr(key).expire(key, windowSeconds, 'NX').ttl(key).exec();

    if (!results) {
      // Redis indisponible : la limitation ne doit pas rendre l'API inutilisable.
      return { count: 1, ttlSeconds: windowSeconds };
    }

    const count = readNumber(results[0]) ?? 1;
    const ttlSeconds = readNumber(results[2]) ?? windowSeconds;

    return { count, ttlSeconds: ttlSeconds > 0 ? ttlSeconds : windowSeconds };
  }

  /**
   * Verrou court non bloquant.
   *
   * Utilise pour serialiser une operation sensible sans jamais attendre : la
   * requete concurrente recoit immediatement un conflit plutot que de retenir
   * une connexion.
   */
  async acquireLock(key: string, ttlSeconds: number, token: string): Promise<boolean> {
    const result = await this.client.set(key, token, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async releaseLock(key: string, token: string): Promise<void> {
    const current = await this.client.get(key);
    if (current === token) {
      await this.client.del(key);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }
}

function readNumber(entry: [Error | null, unknown] | undefined): number | undefined {
  if (!entry || entry[0] !== null) {
    return undefined;
  }
  return typeof entry[1] === 'number' ? entry[1] : undefined;
}
