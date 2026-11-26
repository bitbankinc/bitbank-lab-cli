import { z } from "zod";

const ParamPropSchema = z.object({
  type: z.string(),
  description: z.string(),
  enum: z.array(z.string()).optional(),
  default: z.unknown().optional(),
  /** 位置引数（`bitbank profile show <name>`）。省略時は `--name=...` のフラグ扱い。 */
  positional: z.boolean().optional(),
});

export const SchemaDefSchema = z.object({
  category: z.enum(["public", "private", "trade", "stream", "tax", "paper", "profile"]),
  params: z.record(z.string(), ParamPropSchema),
  output: z.record(z.string(), z.unknown()),
});

export type ParamProp = z.infer<typeof ParamPropSchema>;
export type SchemaDef = z.infer<typeof SchemaDefSchema>;

/** サブコマンド形式で呼ぶカテゴリ（`bitbank <group> <name>`）。router.ts の
 *  GROUP_REGISTRY と対。グループ名はカテゴリ名と一致させる。
 *  構築時は category リテラルで検査し、公開型は `ReadonlySet<string>` にする
 *  （呼び出し側はユーザー入力の文字列を渡すので、category へのキャストを強いない）。 */
export const SUBCOMMAND_GROUPS: ReadonlySet<string> = new Set<SchemaDef["category"]>([
  "trade",
  "tax",
  "paper",
  "profile",
]);

/** ALL_SCHEMAS のキー = 実際の呼び出しパス。サブコマンドは `<group> <name>` へ
 *  名前空間化して、`assets`（private）と `paper assets` のような同名衝突を
 *  構造的に防ぐ（フラットなキーだと後勝ちで静かに上書きされる）。 */
export function schemaKey(name: string, category: SchemaDef["category"]): string {
  return SUBCOMMAND_GROUPS.has(category) ? `${category} ${name}` : name;
}

/** Shorthand: p(type, description) or p(type, description, { enum, default, positional }) */
export function p(
  type: string,
  description: string,
  // Zod の `.options` は readonly タプル。ここは読むだけなので readonly で受ける
  extra?: { enum?: readonly string[]; default?: unknown; positional?: boolean },
): ParamProp {
  return {
    type,
    description,
    ...(extra?.enum ? { enum: [...extra.enum] } : {}),
    ...(extra?.default !== undefined ? { default: extra.default } : {}),
    ...(extra?.positional ? { positional: true } : {}),
  };
}
