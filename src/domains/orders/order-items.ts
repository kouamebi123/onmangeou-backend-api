import { validationFailed } from '../../common/errors/domain.error';

/** Quote and checkout must aggregate duplicate products using the same limits. */
export function aggregateOrderItems(items: Array<{ productId: string; quantity: number }>) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    const quantity = (quantities.get(item.productId) ?? 0) + item.quantity;
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || quantity > 20) {
      throw validationFailed([
        { field: 'items', code: 'invalid', message: 'Choisissez entre 1 et 20 portions par plat.' },
      ]);
    }
    quantities.set(item.productId, quantity);
  }
  if (quantities.size === 0)
    throw validationFailed([{ field: 'items', code: 'required', message: 'Le panier est vide.' }]);
  return quantities;
}
