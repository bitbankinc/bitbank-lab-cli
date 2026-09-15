// periodical-brief の JST 表示用ヘルパー（ADR-008）。
// 「本日ここまでの出来高」「曜日別平均」「直近確定日」は読み手（日本の取引時間帯）の暦で
// 切るため JST で判定する。API のキー（年間ファイル・YYYYMMDD）は従来どおり UTC
// （cli/date-utils.ts）で組み立て、JST はこの表示・集計の側にだけ現れる。
// ホスト TZ 非依存を保つため epoch を +9h ずらして getUTC* で読む（jstYear と同じ手法）。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 曜日ラベル。index は Mon=0 … Sun=6（ISO 週の並び。土日判定を末尾 2 つに寄せる） */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type JstParts = {
  /** `YYYY-MM-DD`（JST） */
  date: string;
  /** `MM-DD`（JST）。3 行目の日付表示用 */
  monthDay: string;
  /** Mon=0 … Sun=6 */
  weekdayIndex: number;
  weekday: Weekday;
  /** `HH:MM`（JST）。ヘッダ用 */
  time: string;
};

const pad = (n: number): string => String(n).padStart(2, "0");

export function jstParts(ms: number): JstParts {
  const d = new Date(ms + JST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  // getUTCDay は Sun=0。Mon=0 に回す
  const weekdayIndex = (d.getUTCDay() + 6) % 7;
  return {
    date: `${y}-${mo}-${day}`,
    monthDay: `${mo}-${day}`,
    weekdayIndex,
    weekday: WEEKDAYS[weekdayIndex],
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

export const isWeekday = (i: number): boolean => i < 5;
export const isSaturday = (i: number): boolean => i === 5;
export const isSunday = (i: number): boolean => i === 6;
