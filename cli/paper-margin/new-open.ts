// 新規建ての可否（ADR-010 / docs/dev/paper-margin-plan.md §2.3）。純関数。
// 契約締結前交付書面: 新規建ては、受入保証金合計額が「維持必要保証金額 + 約定時必要保証金額
// （新規建て注文金額 × 比率）」以上のときだけ出せる。発注中の新規建て注文の分も約定時必要保証金に入る。
// 本番はこれに加えて審査で決まるご利用可能額でも頭打ちになるが、paper は再現しない（計画書 §1）。
// 追証・不足金がある間の新規建て停止は口座の状態で決まるので、ここではなく呼び出し側で止める。
import { hasEnough, snapAmount } from "../paper-precision.js";
import type { Result } from "../types.js";
import type { MarginAccount } from "./account.js";

/** あといくらの注文金額まで新規建てできるか（paper の見積り。本番の available_balances にあたる） */
export function newOpenCapacity(a: MarginAccount, riskRatio: number): number {
  const room = a.totalMarginBalance - a.positionMaintenanceMargin - a.openOrderMaintenanceMargin;
  return room > 0 ? snapAmount(room / riskRatio) : 0;
}

const yen = (x: number) => String(Number(x.toFixed(4)));

/** 新規建ての注文を出してよいか。notional は注文金額（指値は数量 × 指値、成行は数量 × 評価時の価格） */
export function checkNewOpen(
  a: MarginAccount,
  req: { pair: string; notional: number; riskRatio: number },
): Result<{ requiredMargin: number; capacity: number }> {
  if (!(Number.isFinite(req.notional) && req.notional > 0)) {
    return { success: false, error: `new open: invalid notional ${req.notional}` };
  }
  if (!(req.riskRatio > 0 && req.riskRatio <= 1)) {
    return { success: false, error: `new open: invalid risk ratio ${req.riskRatio}` };
  }
  const required =
    a.positionMaintenanceMargin + a.openOrderMaintenanceMargin + req.notional * req.riskRatio;
  const capacity = newOpenCapacity(a, req.riskRatio);
  if (hasEnough(a.totalMarginBalance, required)) {
    return { success: true, data: { requiredMargin: snapAmount(required), capacity } };
  }
  return {
    success: false,
    error:
      `新規建て可能額を超えています（本番では 50061 で拒否される）: ${req.pair} の新規建て可能額は ` +
      `${yen(capacity)} 円、注文金額は ${yen(req.notional)} 円（受入保証金合計額 ${yen(a.totalMarginBalance)} 円、` +
      `この注文を含む必要保証金額 ${yen(required)} 円）`,
  };
}
