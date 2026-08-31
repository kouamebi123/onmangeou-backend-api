import type { MoneyView } from '../../common/money/money';
import type { ModuleCode } from './module-codes';

export interface ModuleCatalogItem {
  code: ModuleCode;
  label: string;
  included: boolean;
  monthlyPrice: MoneyView;
}

export interface ModuleCatalogView {
  currency: string;
  published: boolean;
  notice: string;
  modules: ModuleCatalogItem[];
}

export function quoteMonthlyAmount(
  enabled: readonly string[],
  prices: Readonly<Record<string, bigint>>,
): bigint {
  return enabled.reduce((sum, code) => {
    const price = prices[code];
    return price === undefined ? sum : sum + price;
  }, 0n);
}
