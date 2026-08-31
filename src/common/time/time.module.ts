import { Global, Module } from '@nestjs/common';
import { Clock } from './clock';

/**
 * L'horloge est disponible partout : chaque service qui manipule une expiration,
 * un horaire ou une transition d'etat en depend, et aucun ne doit lire l'heure
 * systeme directement (specification section 13.2).
 */
@Global()
@Module({
  providers: [Clock],
  exports: [Clock],
})
export class TimeModule {}
