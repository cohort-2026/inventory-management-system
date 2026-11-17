/**
 * Decimal helpers for GRN quantities. Values remain strings until parsed into
 * scaled BigInts; no binary floating-point arithmetic is involved.
 *
 * Database input fields permit up to four decimal places. Multiplying two
 * such values can produce up to eight decimal places, which must not be lost.
 */
const INPUT_SCALE = 4;
const INPUT_FACTOR = 10n ** BigInt(INPUT_SCALE);
const DECIMAL_PATTERN = /^\d+(?:\.\d{1,4})?$/;

function parseInput(value: string): bigint | null {
  if (!DECIMAL_PATTERN.test(value)) {
    return null;
  }

  const [whole = '', fraction = ''] = value.split('.');
  return BigInt(whole) * INPUT_FACTOR + BigInt(fraction.padEnd(INPUT_SCALE, '0') || '0');
}

function formatScaled(value: bigint, scale: number): string {
  const factor = 10n ** BigInt(scale);
  const whole = (value / factor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = (value % factor)
    .toString()
    .padStart(scale, '0')
    .replace(/0+$/, '');

  return fraction ? `${whole}.${fraction}` : whole;
}

/** Render a supplied nonnegative four-place decimal without trailing zeros. */
export function formatReceiptDecimal(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const scaled = parseInput(String(value));
  return scaled === null ? '—' : formatScaled(scaled, INPUT_SCALE);
}

/** Accurate base units = received packs × units per pack. */
export function formatReceiptBaseUnits(
  receivedPacks: string | number,
  unitsPerPack: string | number
): string {
  const packs = parseInput(String(receivedPacks));
  const units = parseInput(String(unitsPerPack));

  if (packs === null || units === null) {
    return '—';
  }

  return formatScaled(packs * units, INPUT_SCALE * 2);
}

/** Comparison without Number(), used for the short-delivery UI indicator. */
export function isShortReceipt(
  receivedPacks: string | number,
  expectedPacks: string | number
): boolean {
  const received = parseInput(String(receivedPacks));
  const expected = parseInput(String(expectedPacks));
  return received !== null && expected !== null && received < expected;
}

export function isZeroReceipt(value: string | number): boolean {
  const parsed = parseInput(String(value));
  return parsed !== null && parsed === 0n;
}
