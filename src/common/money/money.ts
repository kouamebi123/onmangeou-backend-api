/**
 * Arithmetique monetaire OnMangeOu.
 *
 * Reference : specification section 13.3 et principe non negociable 4.
 *
 * Invariants :
 *  - un montant est un entier de FCFA, represente par un `bigint` ;
 *  - aucun flottant n'intervient dans un calcul faisant foi ;
 *  - un montant expose au client ne peut jamais etre negatif ;
 *  - l'arrondi est toujours explicite et documente ;
 *  - la devise est XOF pour le marche initial.
 *
 * Cas limites couverts par les tests unitaires :
 *  - remise superieure au sous-total : le total est plafonne a zero, jamais negatif ;
 *  - remise en pourcentage sur un montant impair : arrondi au FCFA le plus proche ;
 *  - somme d'une liste vide : zero et non une erreur.
 */

export const CURRENCY_CODE = 'XOF' as const;
export const CURRENCY_LABEL = 'FCFA' as const;

/** Espace insecable etroit : evite une coupure de ligne entre 12 500 et FCFA. */
const NARROW_NO_BREAK_SPACE = '\u202F';

export class MoneyError extends Error {}

export function assertValidAmount(amount: bigint, label = 'montant'): void {
  if (amount < 0n) {
    throw new MoneyError(`Le ${label} ne peut pas etre negatif : ${amount.toString()}`);
  }
}

/**
 * Convertit une entree externe en montant FCFA entier.
 *
 * Refuse explicitement les valeurs a decimales : le FCFA n'a pas de subdivision
 * en circulation, et accepter 100.5 masquerait une erreur de saisie.
 */
export function toAmount(value: unknown, label = 'montant'): bigint {
  if (typeof value === 'bigint') {
    assertValidAmount(value, label);
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new MoneyError(`Le ${label} doit etre un entier de FCFA, recu : ${value}`);
    }
    const amount = BigInt(value);
    assertValidAmount(amount, label);
    return amount;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!/^-?\d+$/.test(normalized)) {
      throw new MoneyError(`Le ${label} doit etre un entier de FCFA, recu : "${value}"`);
    }
    const amount = BigInt(normalized);
    assertValidAmount(amount, label);
    return amount;
  }

  throw new MoneyError(`Le ${label} est illisible : ${typeof value}`);
}

export function sumAmounts(amounts: readonly bigint[]): bigint {
  return amounts.reduce<bigint>((total, amount) => {
    assertValidAmount(amount, 'montant additionne');
    return total + amount;
  }, 0n);
}

export function multiplyAmount(unitAmount: bigint, quantity: number): bigint {
  assertValidAmount(unitAmount, 'prix unitaire');

  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MoneyError(`La quantite doit etre un entier positif, recu : ${quantity}`);
  }

  return unitAmount * BigInt(quantity);
}

/**
 * Soustraction plafonnee a zero.
 *
 * Une reduction ne peut jamais rendre un total negatif (specification section 8.3).
 * Le depassement est plafonne plutot que rejete : c'est au service de commande de
 * decider si l'ecart doit remonter comme une erreur metier.
 */
export function subtractToFloor(amount: bigint, deduction: bigint): bigint {
  assertValidAmount(amount, 'montant');
  assertValidAmount(deduction, 'deduction');

  const result = amount - deduction;
  return result < 0n ? 0n : result;
}

/**
 * Applique un pourcentage de remise avec arrondi au FCFA le plus proche.
 *
 * L'arrondi choisi est "half up" sur la valeur absolue, calcule en entiers pour
 * eviter toute imprecision flottante : (montant * bps + 5000) / 10000.
 *
 * @param basisPoints remise en centiemes de pourcent (1000 = 10 %)
 */
export function applyDiscountBasisPoints(amount: bigint, basisPoints: number): bigint {
  assertValidAmount(amount, 'montant remise');

  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new MoneyError(
      `La remise doit etre exprimee entre 0 et 10000 points de base, recu : ${basisPoints}`,
    );
  }

  const scaledDiscount = amount * BigInt(basisPoints);
  const discount = (scaledDiscount + 5_000n) / 10_000n;

  return subtractToFloor(amount, discount);
}

/**
 * Repartit un montant en parts entieres sans perte.
 *
 * Les FCFA restants sont distribues un par un sur les premieres parts, de sorte
 * que la somme des parts egale toujours le montant initial.
 */
export function allocateAmount(amount: bigint, shares: number): bigint[] {
  assertValidAmount(amount, 'montant reparti');

  if (!Number.isInteger(shares) || shares <= 0) {
    throw new MoneyError(`Le nombre de parts doit etre un entier strictement positif, recu : ${shares}`);
  }

  const shareCount = BigInt(shares);
  const base = amount / shareCount;
  let remainder = amount % shareCount;

  return Array.from({ length: shares }, () => {
    if (remainder > 0n) {
      remainder -= 1n;
      return base + 1n;
    }
    return base;
  });
}

/**
 * Formate un montant pour l'affichage : `12 500 FCFA` (specification section 13.3).
 *
 * Le formatage d'affichage vit aussi cote client, mais l'API expose une valeur
 * pre-formatee pour garantir un rendu identique partout, notamment dans les
 * exports et les notifications.
 */
export function formatAmount(amount: bigint): string {
  const digits = (amount < 0n ? -amount : amount).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, NARROW_NO_BREAK_SPACE);
  const sign = amount < 0n ? '-' : '';

  return `${sign}${grouped}${NARROW_NO_BREAK_SPACE}${CURRENCY_LABEL}`;
}

/** Representation d'un montant dans les reponses API. */
export interface MoneyView {
  amount: string;
  currency: typeof CURRENCY_CODE;
  formatted: string;
}

/**
 * Les montants traversent l'API en chaine de caracteres : un `bigint` depasse la
 * precision exacte de `Number` en JSON et serait tronque silencieusement.
 */
export function toMoneyView(amount: bigint): MoneyView {
  return {
    amount: amount.toString(),
    currency: CURRENCY_CODE,
    formatted: formatAmount(amount),
  };
}
