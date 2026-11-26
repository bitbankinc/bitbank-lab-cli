// paper の信用の注文を、出す直前の口座の状態で受け付けてよいか（ADR-010 / docs/dev/paper-margin-plan.md §3.6）。純関数。
// - 不足金（JPY 残高が負）がある間は新規建てを拒否する。返済は許す。不足金は強制決済の後だけでなく、損の大きい建玉を
//   返済して JPY が負になり、含み益のある別の建玉が残ったときにも出る。その建玉を返済できないと、不足金を埋める手段が
//   paper reset しか無くなる（本番でも不足金で止まるのは新規建て）
// - 追証が発生中なら新規建てを拒否する。返済は許す（返済は追証を解消する行為の 1 つ）
// - 新規建ては B ≥ Mm + Mo + 注文金額 × r（new-open.ts。本番の 50061 相当）
// - 返済は返済可能数量まで（closable.ts。本番の 50062 相当）
// どれも口座の状態による拒否なので PARAM ではなく一般のエラー（現物 paper の残高不足と同じ扱い）。
import type { MarginOperation, OrderSide, PositionSide } from "../margin-operation.js";
import type { Result } from "../types.js";
import type { MarginAccount } from "./account.js";
import { checkClosable } from "./closable.js";
import { checkNewOpen } from "./new-open.js";
import type { MarginBook } from "./state.js";

export type MarginOrderRequest = {
  pair: string;
  side: OrderSide;
  positionSide: PositionSide;
  amount: number;
  /** 注文金額（指値は数量 × 指値、成行は数量 × 現在値） */
  notional: number;
};

export function checkMarginOrder(input: {
  book: MarginBook;
  op: MarginOperation;
  req: MarginOrderRequest;
  riskRatio: number;
  account: MarginAccount;
}): Result<{ ok: true }> {
  const { book, op, req } = input;
  if (op.intent === "open") {
    if (book.jpy < 0) {
      return {
        success: false,
        error:
          `不足金 ${-book.jpy} 円があるため、新規建てはできません。返済はできます` +
          "（建玉が無ければ、paper には入金が無いので paper reset で作り直す）",
      };
    }
    if (book.call) {
      return {
        success: false,
        error:
          `追証が発生中のため新規建てはできません（追証額 ${book.call.amount} 円、期限 ${book.call.deadline}）。` +
          "返済か現物の売却で解消してください",
      };
    }
    const r = checkNewOpen(input.account, {
      pair: req.pair,
      notional: req.notional,
      riskRatio: input.riskRatio,
    });
    return r.success ? { success: true, data: { ok: true } } : r;
  }
  const r = checkClosable(book.positions, book.orders, req);
  return r.success ? { success: true, data: { ok: true } } : r;
}
