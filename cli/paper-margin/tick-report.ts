// lazy tick の信用の走査結果（scan.ts の ScanEvent）を、paper tick の出力（output.margin）と約定履歴の行に写す。純関数。
// 指値の約定と強制決済の決済は約定履歴（history.ts）に、追証・強制決済は出来事に。強制決済で取り消した注文は id を出す。
import { historyOfFill, historyOfLosscut, type MarginHistoryEntry } from "./history.js";
import type { ScanEvent } from "./scan-context.js";

export type MarginTickEvent =
  | { kind: "margin-call"; at: string; deadline: string; amount: number }
  | { kind: "margin-call-resolved"; at: string }
  | {
      kind: "losscut";
      at: string;
      reason: "below-losscut" | "margin-call-expired";
      /** 強制決済で取り消した信用の注文の id */
      canceled: string[];
    };

export type MarginTickReport = {
  filled: MarginHistoryEntry[];
  events: MarginTickEvent[];
  approximate: boolean;
};

export function reportOfScan(
  scanEvents: readonly ScanEvent[],
  newId: () => string,
): { filled: MarginHistoryEntry[]; events: MarginTickEvent[] } {
  const filled: MarginHistoryEntry[] = [];
  const events: MarginTickEvent[] = [];
  for (const e of scanEvents) {
    if (e.kind === "fill") filled.push(historyOfFill(e));
    else if (e.kind === "margin-call") {
      const { judgedAt: at, deadline, amount } = e.call;
      events.push({ kind: e.kind, at, deadline, amount });
    } else if (e.kind === "losscut") {
      for (const c of e.closes) filled.push(historyOfLosscut(c, newId(), e.at));
      const canceled = e.canceled.map((o) => o.id);
      events.push({ kind: e.kind, at: e.at, reason: e.reason, canceled });
    } else events.push(e);
  }
  return { filled, events };
}
