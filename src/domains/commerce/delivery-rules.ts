const transitions: Record<string, readonly string[]> = {
  UNASSIGNED: ['ASSIGNED'],
  ASSIGNED: ['PICKED_UP'],
  PICKED_UP: ['DELIVERING'],
  DELIVERING: ['DELIVERED'],
};

export function canAdvanceDelivery(from: string, to: string, orderStatus: string, service: string): boolean {
  if (service !== 'DELIVERY') return false;
  if (to === 'CANCELLED') return ['CANCELLED', 'REJECTED'].includes(orderStatus) && from !== 'DELIVERED';
  if (['CANCELLED', 'REJECTED', 'COMPLETED'].includes(orderStatus)) return false;
  if (!transitions[from]?.includes(to)) return false;
  return to === 'ASSIGNED'
    ? ['ACCEPTED', 'PREPARING', 'READY'].includes(orderStatus)
    : orderStatus === 'READY';
}
