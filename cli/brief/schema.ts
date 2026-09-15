// periodical-brief の出力契約。Zod が型の単一ソース（CLAUDE.md）。
// 数値は倍精度（ADR-007 と同じ扱い。厳密有理数は税務経路に限る）。
import { z } from "zod";
import { WEEKDAYS } from "./jst.js";

const nullableNumber = z.number().nullable();

export const TRENDS = ["UP", "DOWN", "MIX"] as const;

/** 曜日別出来高。確定日足の直近 30 本を JST の曜日で分ける */
export const VolumeProfileSchema = z.object({
  /** JST 当日の 0:00 から現在までの時間足出来高の合計（未確定・途中経過） */
  today_jst: z.number(),
  /** 平日（月〜金）の 1 日平均。標本が無ければ null */
  weekday_avg: nullableNumber,
  sat_avg: nullableNumber,
  sun_avg: nullableNumber,
  /** 土曜平均 ÷ 平日平均（%）。週末の薄商いを一目で見るための比率 */
  sat_vs_weekday_pct: nullableNumber,
  /** 標本全体の 1 日平均 */
  avg_30d: z.number(),
  /** 標本に使った確定日足の本数（新規上場では 30 未満になる） */
  sample_days: z.number().int(),
});

export const LastConfirmedSchema = z.object({
  /** `YYYY-MM-DD`（JST） */
  date: z.string(),
  weekday: z.enum(WEEKDAYS),
  open: z.number(),
  close: z.number(),
  change_pct: z.number(),
});

export const PairBriefSchema = z.object({
  pair: z.string(),
  /** 直近日足の終値（当日足が未確定なら現在値相当） */
  price: z.number(),
  /** 直近日足の始値比（%） */
  intraday_pct: z.number(),
  /** 当日の日足がまだ確定していない（指標は当日足を除いて計算済み） */
  daily_incomplete: z.boolean(),
  rsi14: nullableNumber,
  macd_hist: nullableNumber,
  macd_sign: z.enum(["+", "-"]).nullable(),
  sma20: nullableNumber,
  sma50: nullableNumber,
  sma200: nullableNumber,
  /** SMA20/50/200 との位置関係。2 本以上下なら DOWN、全部上なら UP、それ以外 MIX。
   *  SMA が 1 本も揃わない（確定足 20 本未満）ときも MIX */
  trend: z.enum(TRENDS),
  /** 例: ["<S20", ">S50", ">S200"]。本数不足の SMA は載らない */
  position: z.array(z.string()),
  volume: VolumeProfileSchema,
  /** 直近の確定日足。確定足が 1 本も無ければ null */
  last_confirmed: LastConfirmedSchema.nullable(),
  atr14: nullableNumber,
  /** 3 行ダイジェスト（text と同じ内容を銘柄単位で持つ） */
  lines: z.tuple([z.string(), z.string(), z.string()]),
});

export const BriefErrorSchema = z.object({ pair: z.string(), error: z.string() });

export const BriefSchema = z.object({
  /** 取得時刻（ISO 8601 / UTC） */
  as_of: z.string(),
  /** ヘッダ表示用（`YYYY-MM-DD Www HH:MM JST`） */
  as_of_jst: z.string(),
  pairs: z.array(PairBriefSchema),
  /** 取得・計算に失敗した銘柄。1 件でもあれば Result.partial が立つ */
  errors: z.array(BriefErrorSchema),
  /** ヘッダ + 各銘柄 3 行を連結したダイジェスト本文（human / LLM 両読み） */
  text: z.string(),
  /** 前提の注記。指標の定義と「確定足のみ」を出力に同梱する（ADR-007 と同じ考え方） */
  note: z.string(),
});

export type VolumeProfile = z.infer<typeof VolumeProfileSchema>;
export type PairBrief = z.infer<typeof PairBriefSchema>;
export type Brief = z.infer<typeof BriefSchema>;
