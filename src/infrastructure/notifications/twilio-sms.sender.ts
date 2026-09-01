import { ServiceUnavailableException } from '@nestjs/common';
import type { SmsSender } from './sms.port';

/** Transport only: OTP generation, expiry and rate limits stay in the domain. */
export class TwilioSmsSender implements SmsSender {
  constructor(private readonly config: { accountSid: string; authToken: string; from: string }) {
    if (!/^AC[0-9a-f]{32}$/i.test(config.accountSid) || !config.authToken || !config.from) {
      throw new Error('Configuration SMS Twilio incomplete');
    }
  }

  async send(input: { to: string; body: string; templateCode: string }) {
    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: input.to, From: this.config.from, Body: input.body }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      // Never expose provider responses: they may contain phone numbers or OTPs.
      if (!response.ok) throw new Error('SMS provider rejected request');
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('sid' in result) || typeof result.sid !== 'string') {
        throw new Error('Invalid SMS provider response');
      }
      return { providerMessageId: result.sid };
    } catch {
      throw new ServiceUnavailableException('Le SMS n’a pas pu être envoyé. Veuillez réessayer.');
    }
  }
}
