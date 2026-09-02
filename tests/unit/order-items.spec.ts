import { describe, expect, it } from 'vitest';
import { aggregateOrderItems } from '../../src/domains/orders/order-items';

describe('Shared quote and checkout quantities', () => {
  it('merges duplicate products before pricing', () => {
    expect([
      ...aggregateOrderItems([
        { productId: 'a', quantity: 2 },
        { productId: 'a', quantity: 3 },
      ]),
    ]).toEqual([['a', 5]]);
  });
  it('does not allow bypassing the 20-portion limit with duplicate lines', () => {
    expect(() =>
      aggregateOrderItems([
        { productId: 'a', quantity: 20 },
        { productId: 'a', quantity: 1 },
      ]),
    ).toThrow();
  });
  it.each([0, -1, 1.5, 21])('rejects invalid quantity %s', (quantity) => {
    expect(() => aggregateOrderItems([{ productId: 'a', quantity }])).toThrow();
  });
  it('rejects an empty cart', () => expect(() => aggregateOrderItems([])).toThrow());
});
