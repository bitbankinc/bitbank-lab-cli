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

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
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

function formatYMD(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** 日付を offset 日ずらす。年タイプは offset 年ずらす */
export function shiftDate(dateStr: string, offset: number, type: string): string {
  if (YEARLY_TYPES.has(type)) return String(Number(dateStr) + offset);
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(4, 6)) - 1;
  const d = Number(dateStr.slice(6, 8));
  return formatYMD(new Date(y, m, d + offset));
}

/** 今日の日付を YYYYMMDD（年タイプは YYYY）で返す */
export function todayDate(type: string): string {
  const now = new Date();
  if (YEARLY_TYPES.has(type)) return String(now.getFullYear());
  return formatYMD(now);
}
