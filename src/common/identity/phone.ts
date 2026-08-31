/**
 * Normalisation des numeros de telephone ivoiriens vers le format E.164.
 *
 * Reference : specification sections 8.2 et 10.1.
 *
 * La Cote d'Ivoire utilise l'indicatif +225 et, depuis le passage a dix chiffres
 * de 2021, un numero national de dix chiffres. Les saisies courantes acceptees :
 *   0701020304, 07 01 02 03 04, +225 07 01 02 03 04, 00225 0701020304.
 *
 * Aucune bibliotheque externe : le perimetre est un seul pays et la regle tient
 * en quelques lignes verifiables (specification section 5.3).
 */

export const DEFAULT_COUNTRY_CALLING_CODE = '225' as const;

/** Longueur du numero national ivoirien apres la reforme de 2021. */
const CI_NATIONAL_NUMBER_LENGTH = 10;

export class PhoneNumberError extends Error {}

export interface NormalizedPhone {
  /** Format canonique stocke en base, par exemple `+2250701020304`. */
  e164: string;
  /** Numero national sans indicatif, pour affichage local. */
  national: string;
  countryCallingCode: string;
}

export function normalizeIvorianPhone(input: string): NormalizedPhone {
  const digitsOnly = input.replace(/[\s.\-()]/g, '');

  if (digitsOnly.length === 0) {
    throw new PhoneNumberError('Le numero de telephone est vide.');
  }

  if (!/^\+?\d+$/.test(digitsOnly)) {
    throw new PhoneNumberError('Le numero de telephone contient des caracteres invalides.');
  }

  let national = digitsOnly;

  if (national.startsWith('+')) {
    national = national.slice(1);
  }

  if (national.startsWith('00')) {
    national = national.slice(2);
  }

  if (national.startsWith(DEFAULT_COUNTRY_CALLING_CODE) && national.length > CI_NATIONAL_NUMBER_LENGTH) {
    national = national.slice(DEFAULT_COUNTRY_CALLING_CODE.length);
  }

  if (national.length !== CI_NATIONAL_NUMBER_LENGTH) {
    throw new PhoneNumberError(
      `Un numero ivoirien comporte ${CI_NATIONAL_NUMBER_LENGTH} chiffres apres l'indicatif.`,
    );
  }

  return {
    e164: `+${DEFAULT_COUNTRY_CALLING_CODE}${national}`,
    national,
    countryCallingCode: DEFAULT_COUNTRY_CALLING_CODE,
  };
}

export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

/**
 * Masque un numero pour les journaux et les reponses de support.
 *
 * Les logs ne doivent jamais permettre de reconstituer un identifiant de
 * connexion complet (specification section 22).
 */
export function maskPhone(e164: string): string {
  if (e164.length < 6) {
    return '***';
  }
  return `${e164.slice(0, 5)}${'*'.repeat(e164.length - 7)}${e164.slice(-2)}`;
}
