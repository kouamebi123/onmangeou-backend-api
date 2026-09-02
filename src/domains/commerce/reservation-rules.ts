export const reservationTransitions: Record<string, readonly string[]> = {
  REQUESTED: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED: ['COMPLETED'],
};

export function canChangeReservationStatus(from: string, to: string): boolean {
  return reservationTransitions[from]?.includes(to) ?? false;
}
