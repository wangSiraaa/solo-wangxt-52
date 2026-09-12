import Decimal from 'decimal.js';

/** 金额一律以 Decimal 计算，避免浮点误差；分单位用 toMoney 固化为两位小数字符串。 */
export function d(v: string | number | Decimal): Decimal {
  return new Decimal(v);
}

export function toMoney(v: Decimal | string | number): string {
  return d(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function addMoney(a: string, b: string): string {
  return toMoney(d(a).plus(d(b)));
}

export function cmpMoney(a: string, b: string): number {
  return d(a).cmp(d(b));
}
