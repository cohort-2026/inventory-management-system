export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

type NumericInput = string | number | null | undefined;

/** Parse an exact nonnegative decimal, without coercing null or '' into zero. */
function parseNonnegativeDecimal(value: NumericInput, field: string): string {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^(?:\d+)(?:\.\d+)?$/.test(text) ||
      (typeof value === 'number' && !Number.isFinite(value))) {
    throw new Error(`Invalid ${field}: expected a nonnegative decimal.`);
  }

  const [rawWhole = '', rawFraction = ''] = text.split('.');
  const whole = rawWhole.replace(/^0+(?=\d)/, '');
  const fraction = rawFraction.replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

/** Compare normalized decimals exactly, without floating-point rounding. */
function compareDecimal(a: string, b: string): number {
  const [aWhole = '', aFrac = ''] = a.split('.');
  const [bWhole = '', bFrac = ''] = b.split('.');
  if (aWhole.length !== bWhole.length) return aWhole.length > bWhole.length ? 1 : -1;
  if (aWhole !== bWhole) return aWhole > bWhole ? 1 : -1;
  const width = Math.max(aFrac.length, bFrac.length);
  const left = aFrac.padEnd(width, '0');
  const right = bFrac.padEnd(width, '0');
  return left === right ? 0 : left > right ? 1 : -1;
}

/** Compare the quantity for one product at one location with the product reorder level. */
export function calculateInventoryStatus(
  quantity: NumericInput,
  reorderLevel: NumericInput,
): StockStatus {
  const q = parseNonnegativeDecimal(quantity, 'quantity');
  const r = parseNonnegativeDecimal(reorderLevel, 'reorder level');
  if (q === '0') return 'OUT_OF_STOCK';
  return compareDecimal(q, r) < 0 ? 'LOW_STOCK' : 'IN_STOCK';
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  IN_STOCK: 'In Stock',
  LOW_STOCK: 'Low Stock',
  OUT_OF_STOCK: 'Out of Stock',
};
