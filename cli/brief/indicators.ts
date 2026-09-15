// periodical-brief の指標計算（ADR-008）。入力は確定足の終値・OHLC のみで、
// 未確定の当日足は呼び出し側（compute.ts）が除外してから渡す。
// 定義は skills/indicator-analysis/references/indicator-guide.md に合わせる:
// EMA は先頭 N 本の SMA を初期値、RSI / ATR は Wilder 平滑化。

/** 直近 n 本の単純移動平均。本数不足なら null */
export function sma(values: readonly number[], n: number): number | null {
  if (n <= 0 || values.length < n) return null;
  let sum = 0;
  for (let i = values.length - n; i < values.length; i++) sum += values[i];
  return sum / n;
}

/** 指数移動平均の系列。先頭 n 本の SMA を初期値にするため、返す配列は
 *  values.length - n + 1 本（末尾が最新）。本数不足なら空配列 */
export function ema(values: readonly number[], n: number): number[] {
  if (n <= 0 || values.length < n) return [];
  const k = 2 / (n + 1);
  const seed = sma(values.slice(0, n), n) ?? 0;
  const out = [seed];
  let e = seed;
  for (let i = n; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
    out.push(e);
  }
  return out;
}

/** Wilder 平滑化の RSI。closes は n+1 本以上必要。本数不足なら null */
export function rsi(closes: readonly number[], n: number): number | null {
  if (n <= 0 || closes.length < n + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= n; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= n;
  avgLoss /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (n - 1) + Math.max(diff, 0)) / n;
    avgLoss = (avgLoss * (n - 1) + Math.max(-diff, 0)) / n;
  }
  // 横ばい（上昇も下落も無い）は中立の 50。avgLoss だけ 0 なら 100
  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export const MACD_FAST = 12;
export const MACD_SLOW = 26;
export const MACD_SIGNAL = 9;

/** MACD ヒストグラム（MACD ライン − シグナル）の最新値。本数不足なら null */
export function macdHist(closes: readonly number[]): number | null {
  const fast = ema(closes, MACD_FAST);
  const slow = ema(closes, MACD_SLOW);
  if (slow.length === 0) return null;
  // fast は slow より (SLOW - FAST) 本長い。末尾を揃えて差を取る
  const offset = fast.length - slow.length;
  const line = slow.map((s, i) => fast[i + offset] - s);
  const signal = ema(line, MACD_SIGNAL);
  if (signal.length === 0) return null;
  return line[line.length - 1] - signal[signal.length - 1];
}

export type Ohlc = { open: number; high: number; low: number; close: number };

/** Wilder 平滑化の ATR。rows は n+1 本以上必要。本数不足なら null */
export function atr(rows: readonly Ohlc[], n: number): number | null {
  if (n <= 0 || rows.length < n + 1) return null;
  const tr = (i: number): number => {
    const { high, low } = rows[i];
    const prevClose = rows[i - 1].close;
    return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  };
  let a = 0;
  for (let i = 1; i <= n; i++) a += tr(i);
  a /= n;
  for (let i = n + 1; i < rows.length; i++) a = (a * (n - 1) + tr(i)) / n;
  return a;
}
