import type { z } from "zod";

export const CONFIRM_PHRASES = {
  "create-order": "I-UNDERSTAND-CREATE-ORDER",
  "cancel-order": "I-UNDERSTAND-CANCEL-ORDER",
  "cancel-orders": "I-UNDERSTAND-CANCEL-ORDERS",
  "confirm-deposits": "I-UNDERSTAND-CONFIRM-DEPOSITS",
  "confirm-deposits-all": "I-UNDERSTAND-CONFIRM-DEPOSITS-ALL",
} as const;

export type TradeCommandKey = keyof typeof CONFIRM_PHRASES;

type ExecuteConfirmShape = { execute?: boolean; confirm?: string };

/** Zod refinement: when --execute is given, --confirm must match the command's phrase.
 *  Defined as a refine factory so each command schema can compose it via .superRefine().
 *  See .claude/rules/trading-safety.md "--confirm フラグ". */
export function refineExecuteConfirm(command: TradeCommandKey) {
  const phrase = CONFIRM_PHRASES[command];
  return (val: ExecuteConfirmShape, ctx: z.RefinementCtx): void => {
    if (!val.execute) return;
    if (val.confirm !== phrase) {
      ctx.addIssue({
        code: "custom",
        path: ["confirm"],
        message: `--execute requires --confirm=${phrase}`,
      });
    }
  };
}
