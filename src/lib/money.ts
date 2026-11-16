/** Convert a EUR amount with at most two decimal places to safe integer cents. */
export function toCents(euros: number): number {
  if (!Number.isFinite(euros)) throw new RangeError('Money amount must be finite.');
  const decimal = String(euros);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(decimal);
  if (!match || euros < 0) throw new RangeError('Money amount must be non-negative with at most two decimal places.');
  const whole = Number(match[1]);
  const fractional = Number((match[2] ?? '').padEnd(2, '0'));
  const cents = whole * 100 + fractional;
  if (!Number.isSafeInteger(cents)) throw new RangeError('Money amount exceeds the safe integer range.');
  return cents;
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
