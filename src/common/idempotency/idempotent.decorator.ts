import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_METADATA = 'onmangeou:idempotent';

export interface IdempotentOptions {
  /**
   * Portee de la cle. Deux endpoints differents peuvent recevoir la meme cle
   * cliente sans interference (specification section 10.1).
   */
  scope: string;

  /** Duree de conservation de la reponse rejouee. */
  retentionSeconds?: number;
}

/**
 * Rend un endpoint idempotent.
 *
 * Obligatoire pour la creation de commande, le paiement, le remboursement et
 * toute ecriture critique (specification section 10.1). Le scenario obligatoire
 * numero 1 de la section 28.2 est couvert par ce mecanisme : deux clics sur
 * Commander ne creent qu'une seule commande.
 */
export const Idempotent = (options: IdempotentOptions): MethodDecorator =>
  SetMetadata(IDEMPOTENT_METADATA, options);
