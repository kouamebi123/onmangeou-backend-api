import { afterEach, describe, expect, it, vi } from 'vitest';
import { TwilioSmsSender } from '../../src/infrastructure/notifications/twilio-sms.sender';

const config = { accountSid: `AC${'a'.repeat(32)}`, authToken: 'test-only', from: 'OnMangeOu' };
afterEach(() => vi.unstubAllGlobals());
describe('Twilio transport (no actual SMS)', () => {
  it('rejects incomplete configuration', () => {
    expect(() => new TwilioSmsSender({ ...config, authToken: '' })).toThrow();
  });
  it('sends form-encoded content and returns the provider id', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ sid: 'SMtest' })));
    vi.stubGlobal('fetch', fetch);
    const result = await new TwilioSmsSender(config).send({
      to: '+2250700000000',
      body: 'Code test',
      templateCode: 'otp.login',
    });
    expect(result.providerMessageId).toBe('SMtest');
    const body = fetch.mock.calls[0]?.[1]?.body;
    expect(body instanceof URLSearchParams ? body.get('To') : null).toBe('+2250700000000');
  });
  it('does not report success when provider rejects or leaks response content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(
      new TwilioSmsSender(config).send({ to: '+2250700000000', body: '123456', templateCode: 'otp.login' }),
    ).rejects.toThrow('Le SMS');
  });
});
