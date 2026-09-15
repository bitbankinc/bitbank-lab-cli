// paper 残高・建玉の浮動小数点誤差の扱いを 1 箇所に集約する。
// 売買を繰り返すと IEEE754 の累積誤差で残高が 0.0031999999999999967 のように
// なり、pnl の position（0.0032）と食い違って全量売却が永久に通らなくなる
// （issue #30）。数量は約定のたびに固定桁で snap し、残高チェックは EPS を許容する。
// 税務経路（ADR-005）の厳密有理数とは別物で、paper は倍精度のまま誤差を潰すだけ。

/** 残高チェックの許容誤差。bitbank の最小 unit_amount（1e-8）より十分小さい。 */
export const BALANCE_EPS = 1e-9;

/** 数量・残高を snap する小数桁。amount_digits の最大（8）より広く EPS より細かい。 */
export const AMOUNT_DECIMALS = 10;

/** 累積誤差を固定桁に丸めて潰す。-0 は 0 に正規化する。
 * Math.round(x * 1e10) は JPY 残高（1e6〜1e9）で 2^53 を超え得るので toFixed 経由。 */
export function snapAmount(x: number): number {
  if (!Number.isFinite(x)) return x;
  const v = Number(x.toFixed(AMOUNT_DECIMALS));
  return v === 0 ? 0 : v;
}

/** `avail` が `need` を満たすか。EPS 以内の不足は誤差とみなして許容する。 */
export function hasEnough(avail: number, need: number): boolean {
  return avail + BALANCE_EPS >= need;
}
