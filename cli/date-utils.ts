// 100行超: UTC 基準の日付演算・足周期・次境界判定を 1 ファイルに集約
export const YEARLY_TYPES = new Set(["4hour", "8hour", "12hour", "1day", "1week", "1month"]);

// 非うるう年での 1 セグメント（短期足は 1 日分、年タイプは 1 年分）あたりのローソク本数
const ROWS_NON_LEAP: Record<string, number> = {
  "1min": 1440,
  "5min": 288,
  "15min": 96,
  "30min": 48,
  "1hour": 24,
  "4hour": 2190,
  "8hour": 1095,
  "12hour": 730,
  "1day": 365,
  "1week": 52,
  "1month": 12,
};

// うるう年で +1 日分本数が増える年タイプ（値 = 1 日あたりの本数）。1week/1month は影響なし
const LEAP_BONUS: Record<string, number> = {
  "4hour": 6,
  "8hour": 3,
  "12hour": 2,
  "1day": 1,
};

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** 指定年月（month=1-12）の最終日。閏年の 2 月は 29。範囲外は 0。 */
export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0;
  return month === 2 && isLeapYear(year) ? 29 : MONTH_DAYS[month - 1];
}

/**
 * bitbank API が 1 セグメントで返すローソク本数。
 * 1day/4hour/8hour/12hour はうるう年で +1 日分増えるため、year を渡すと正確な値を返す。
 * year 未指定時は保守的にうるう年扱いで最大値を返す（未知 type は 0）。
 */
export function rowsPerSegment(type: string, year?: number): number {
  const base = ROWS_NON_LEAP[type] ?? 0;
  const bonus = LEAP_BONUS[type] ?? 0;
  const isLeap = year === undefined ? true : isLeapYear(year);
  return base + (isLeap ? bonus : 0);
}

// bitbank API は日付境界を UTC 基準で扱う（/candlestick/1hour/20260101 は UTC 2026-01-01 00:00〜23:00）。
// 公式 docs は timezone 未記載だが、実 API で 1hour/1day いずれも UTC 00:00 起点を確認済み。
// ホスト OS の TZ に依存しないよう、文字列化は getUTCxxx 系で行う。

/** ms（UNIX epoch）を UTC の YYYYMMDD 文字列で返す */
export function ymdUtc(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}${String(m).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

/** ms（UNIX epoch）を UTC の YYYY 文字列で返す */
export function yearUtc(ms: number): string {
  return String(new Date(ms).getUTCFullYear());
}

/** 日付を offset 日ずらす。年タイプは offset 年ずらす */
export function shiftDate(dateStr: string, offset: number, type: string): string {
  if (YEARLY_TYPES.has(type)) return String(Number(dateStr) + offset);
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(4, 6)) - 1;
  const d = Number(dateStr.slice(6, 8));
  // Date.UTC で構築して getUTC* で取り出せば、ホスト TZ に依らず UTC 日付がそのまま返る。
  return ymdUtc(Date.UTC(y, m, d + offset));
}

/** 今日の日付を UTC 基準の YYYYMMDD（年タイプは YYYY）で返す */
export function todayDate(type: string): string {
  const now = new Date();
  return YEARLY_TYPES.has(type) ? yearUtc(now.getTime()) : ymdUtc(now.getTime());
}

// 足 1 本あたりの周期（ms）。1month は可変なので含めない（nextBoundaryMs で別処理）。
const STEP_MS_PER_TYPE: Record<string, number> = {
  "1min": 60_000,
  "5min": 300_000,
  "15min": 900_000,
  "30min": 1_800_000,
  "1hour": 3_600_000,
  "4hour": 14_400_000,
  "8hour": 28_800_000,
  "12hour": 43_200_000,
  "1day": 86_400_000,
  "1week": 604_800_000,
};

/**
 * 足の timestamp が属する期間の終端 epoch ms を返す。
 * 1month は UTC 基準の翌月 1 日 00:00 で判定（暦依存）。未知 type は 0。
 */
export function nextBoundaryMs(type: string, ts: number): number {
  const step = STEP_MS_PER_TYPE[type];
  if (step) return ts + step;
  if (type !== "1month") return 0;
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-11
  // Date.UTC は UTC 00:00 を返す。bitbank の 1month 足は UTC 月初 00:00 起点。
  return Date.UTC(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, 1);
}
