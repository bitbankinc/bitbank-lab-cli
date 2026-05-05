export const YEARLY_TYPES = new Set(["4hour", "8hour", "12hour", "1day", "1week", "1month"]);

// bitbank API が 1 リクエストで返すローソク本数（短期足は 1 日分、年タイプは 1 年分）
export const ROWS_PER_SEGMENT: Record<string, number> = {
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
