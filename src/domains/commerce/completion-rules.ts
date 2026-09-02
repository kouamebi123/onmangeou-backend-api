import { DomainError } from '../../common/errors/domain.error';
export function remainingBalance(amount: bigint, paid: bigint, payment: bigint): bigint {
  if (payment <= 0n || paid < 0n || paid > amount || payment > amount - paid) {
    throw new DomainError('VALIDATION_FAILED', 'Règlement invalide', {
      publicDetail: 'Le règlement doit être positif et ne pas dépasser le solde restant.',
    });
  }
  return amount - paid - payment;
}
export function validateEventPeriod(start: Date, end: Date, now: Date): void {
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start <= now ||
    end <= start ||
    end.getTime() - start.getTime() > 7 * 86400_000
  ) {
    throw new DomainError('VALIDATION_FAILED', 'Dates invalides', {
      publicDetail: 'Choisissez un début futur et une fin après le début, sur sept jours maximum.',
    });
  }
}
