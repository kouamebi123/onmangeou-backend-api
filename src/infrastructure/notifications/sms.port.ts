import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../common/config/app-config.service';
import { APP_LOGGER, type AppLogger } from '../../common/logging/app-logger';
import { maskPhone } from '../../common/identity/phone';

export const SMS_SENDER = Symbol('SMS_SENDER');

/**
 * Port d'envoi de SMS.
 *
 * Le fournisseur SMS/WhatsApp n'est pas arrete (specification section 36) :
 * l'interface isole ce choix pour qu'un branchement reel n'impacte aucun service
 * de domaine.
 */
export interface SmsSender {
  send(input: { to: string; body: string; templateCode: string }): Promise<{ providerMessageId: string }>;
}

/**
 * Implementation de developpement.
 *
 * Le corps du message n'est jamais journalise : il contient le code OTP
 * (specification section 22). Seuls le modele et le destinataire masque le sont.
 */
@Injectable()
export class ConsoleSmsSender implements SmsSender {
  constructor(
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
    private readonly config: AppConfigService,
  ) {}

  send(input: { to: string; body: string; templateCode: string }): Promise<{ providerMessageId: string }> {
    this.logger.info('SMS simule', {
      provider: this.config.smsProvider,
      templateCode: input.templateCode,
      to: maskPhone(input.to),
      senderId: this.config.smsSenderId,
    });

    return Promise.resolve({ providerMessageId: `console-${Date.now()}` });
  }
}
