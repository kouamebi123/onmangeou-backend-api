import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Primitives de hachage OnMangeOu.
 *
 * Reference : specification sections 8.2, 21.3 et 22.
 *
 * Deux besoins distincts, deux traitements :
 *
 *  1. Secret a faible entropie (code OTP a six chiffres) : hachage lent scrypt
 *     avec sel aleatoire par enregistrement et poivre serveur. La lenteur est
 *     indispensable car un code a six chiffres se force brutalement en quelques
 *     millisecondes avec un hachage rapide.
 *
 *  2. Secret a forte entropie (refresh token de 256 bits) : SHA-256 avec poivre
 *     serveur. Un hachage lent n'apporterait rien face a un espace de recherche
 *     de 2^256, et penaliserait chaque rafraichissement de session.
 *
 * scrypt provient de `node:crypto` : aucune dependance native a compiler, ce qui
 * evite les echecs de build sur les images Docker minimales.
 */

/** Parametres scrypt : cout memoire d'environ 32 Mio par calcul. */
const SCRYPT_COST = 2 ** 15;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_SALT_BYTES = 16;

const SCRYPT_PREFIX = 'scrypt$1' as const;

/**
 * Hache un secret a faible entropie.
 *
 * Le format stocke est autodescriptif : `scrypt$1$<cout>$<sel>$<empreinte>`.
 * Il permet d'augmenter le cout plus tard tout en verifiant les anciens hachages.
 */
export async function hashLowEntropySecret(plain: string, pepper: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = await deriveScrypt(plain, pepper, salt);

  return [SCRYPT_PREFIX, SCRYPT_COST, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

export async function verifyLowEntropySecret(
  plain: string,
  stored: string,
  pepper: string,
): Promise<boolean> {
  const parts = stored.split('$');

  if (parts.length !== 5 || `${parts[0]}$${parts[1]}` !== SCRYPT_PREFIX) {
    return false;
  }

  const cost = Number(parts[2]);
  const salt = Buffer.from(parts[3] ?? '', 'base64url');
  const expected = Buffer.from(parts[4] ?? '', 'base64url');

  if (!Number.isInteger(cost) || cost <= 0 || salt.length === 0 || expected.length === 0) {
    return false;
  }

  const derived = await deriveScrypt(plain, pepper, salt, cost, expected.length);

  return constantTimeEquals(derived, expected);
}

function deriveScrypt(
  plain: string,
  pepper: string,
  salt: Buffer,
  cost: number = SCRYPT_COST,
  keyLength: number = SCRYPT_KEY_LENGTH,
): Promise<Buffer> {
  const options: ScryptOptions = {
    N: cost,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    // scrypt refuse de s'executer si la memoire requise depasse maxmem.
    maxmem: 256 * cost * SCRYPT_BLOCK_SIZE,
  };

  return new Promise((resolvePromise, rejectPromise) => {
    scrypt(`${plain}${pepper}`, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        rejectPromise(error);
        return;
      }
      resolvePromise(derivedKey);
    });
  });
}

/**
 * Empreinte d'un secret a forte entropie, pour stockage et recherche indexee.
 *
 * Deterministe volontairement : la table `sessions` est interrogee par empreinte
 * lors du rafraichissement, ce qui interdit un sel aleatoire.
 */
export function hashHighEntropySecret(plain: string, pepper: string): string {
  return createHash('sha256').update(`${plain}${pepper}`, 'utf8').digest('base64url');
}

/** Genere un secret opaque de 256 bits. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Genere un code numerique a usage unique.
 *
 * `randomInt` est cryptographiquement sur, contrairement a `Math.random`. Les
 * codes a repetition evidente sont evites : `000000` ou `111111` sont les
 * premieres tentatives d'une attaque manuelle.
 */
export function generateNumericCode(length: number): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const digits = Array.from({ length }, () => randomInt(0, 10)).join('');
    if (!isTriviallyGuessable(digits)) {
      return digits;
    }
  }
  return Array.from({ length }, () => randomInt(1, 10)).join('');
}

function isTriviallyGuessable(digits: string): boolean {
  const allIdentical = new Set(digits).size === 1;
  const ascending = digits.split('').every((digit, index, all) => {
    const previous = all[index - 1];
    return index === 0 || previous === undefined || Number(digit) === Number(previous) + 1;
  });

  return allIdentical || ascending;
}

export function constantTimeEquals(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/** Empreinte stable d'un corps de requete, pour la detection de rejeu. */
export function hashRequestPayload(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload), 'utf8').digest('hex');
}

/**
 * Serialisation deterministe : l'ordre des cles d'un objet JSON n'est pas
 * garanti, or deux corps identiques doivent produire la meme empreinte.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);

  return `{${entries.join(',')}}`;
}
