export interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  details?: { error?: string };
}
export class PushProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}
export function validExpoToken(token: string): boolean {
  return /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token);
}
export function retryDelay(attempt: number): number {
  return Math.min(3600, 30 * 2 ** Math.min(attempt, 7));
}
export async function expoCall(
  path: 'send' | 'getReceipts',
  body: unknown,
  accessToken?: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new PushProviderError('NETWORK', true);
  }
  if (!response.ok)
    throw new PushProviderError(`HTTP_${response.status}`, response.status === 429 || response.status >= 500);
  const parsed: unknown = await response.json();
  if (!parsed || typeof parsed !== 'object' || !('data' in parsed))
    throw new PushProviderError('INVALID_RESPONSE', true);
  return parsed.data;
}
export function readTicket(value: unknown): ExpoTicket {
  if (
    !value ||
    typeof value !== 'object' ||
    !('status' in value) ||
    (value.status !== 'ok' && value.status !== 'error')
  )
    throw new PushProviderError('INVALID_RESPONSE', true);
  return value as ExpoTicket;
}
