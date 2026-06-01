# カスタマイズガイド

このプロジェクトは CLI と Agent Skills の両方を拡張できる設計になっています。

---

## 1. 独自 Skill の追加

Skill は「モデルへの指示書」です。コードは書きません。CLI コマンドをどう組み合わせて分析するかをモデルに教えます。

### ディレクトリを作成

```
skills/
  _shared/
    references/
      bitbank-api-formats.md   # 既存。全 Skill 共通の API レスポンス形式
      pair-classification.md   # 既存。全 Skill 共通のペア分類
  <skill-name>/
    SKILL.md                   # Skill 定義（必須）
    references/                # ドメイン固有の参照資料（任意）
      <domain-specific>.md
```

### SKILL.md を書く

```markdown
---
name: my-strategy
description: |
  何をする Skill か、1〜3行で説明。
  トリガーとなるユーザーの発話例:
  「〇〇を分析して」「〇〇の状況は？」
compatibility: |
  Requires bitbank CLI. Node.js 20+.
metadata:
  author: your-name
  version: "1.0"
---

# My Strategy Skill

## データ取得

どの CLI コマンドをどの引数で実行するか:

\`\`\`bash
bitbank candles btc_jpy --type=1day --format=json
\`\`\`

## 計算手順

取得データをどう計算・分析するかの手順。

## 出力フォーマット

結果をどう表示するかのテンプレート。

## Gotchas

注意点・落とし穴。
```

### 重要なポイント

- **分析ロジックのコードは書かない。** 手順をモデルに伝え、モデルが計算する
- **CLI コマンドの実行例を具体的に書く。** モデルが正確にコマンドを組み立てられるようにする
- **Gotchas を充実させる。** 価格が文字列で返る、配列の順序など、モデルが間違えやすいポイントを列挙する
- **共通の参照資料は `_shared/references/` を参照する。** `bitbank-api-formats.md` などはコピーせず、SKILL.md から `_shared/references/bitbank-api-formats.md` というパスで参照する
- **ドメイン固有の資料だけを `<skill-name>/references/` に置く。** `<domain>-guide.md` のような命名で

### 動作確認

Claude Code でリポジトリを開き、Skill の description に書いた発話例で話しかけて、正しくトリガーされることを確認します。

---

## 2. Skill のカスタマイズ例

### テクニカル指標のパラメータ変更

`indicator-analysis` Skill の「デフォルト分析セット」を変更:

```markdown
## デフォルト分析セット

- **SMA**: 10, 25, 75 期間（短期トレード向け）
- **RSI**: 9 期間
- **MACD**: 短期 8, 長期 21, シグナル 5
```

### バックテストのデフォルト戦略変更

`backtest` Skill の「デフォルト戦略」セクションを編集:

```markdown
## デフォルト戦略: RSI 逆張り

- **買いエントリー:** RSI(14) が 30 を下回った次の足の始値
- **売りイグジット:** RSI(14) が 70 を上回った次の足の始値
- **初期資金:** 1,000,000 JPY
- **手数料:** 片道 0.12%
```

### 複合 Skill の作成

複数の分析を組み合わせた Skill を作れます。例えば「モーニングレポート」:

```markdown
---
name: morning-report
description: |
  毎朝の暗号資産マーケットレポートを生成する。
  「今日のレポート」「朝のマーケット状況」で起動。
---

# モーニングレポート Skill

## 実行フロー

1. 主要ペア（BTC, ETH, XRP）の ticker を取得
2. 各ペアの日足ローソク足を取得（直近30日）
3. SMA(20), RSI(14) を計算
4. 前日比・週間変動率を算出
5. 総合サマリーを出力
```

---

## 3. CLI コマンドの追加

新しい API エンドポイントに対応するコマンドを追加できます。

### カテゴリ

コマンドはカテゴリごとに「ディレクトリ・ハンドラ・registry」が分かれています。

| カテゴリ | ディレクトリ | CLI 呼び出し | 認証 |
|---------|------------|-------------|------|
| `public` | `cli/commands/public/` | `bitbank <cmd>` | 不要 |
| `private` | `cli/commands/private/` | `bitbank <cmd>` | 必要 |
| `trade` | `cli/commands/trade/` | `bitbank trade <cmd>` | 必要 |
| `paper` | `cli/commands/paper/` | `bitbank paper <cmd>` | 不要 |
| `profile` | `cli/commands/profile/` | `bitbank profile <cmd>` | 不要 |

`schema` / `profiles` / `completion` などの meta コマンドは registry に登録せず、
`cli/router.ts` の `handleSpecialCommand` で個別にディスパッチします（API は叩かない）。

### 手順

1. **コマンド本体を作成** — `cli/commands/<category>/<command>.ts` に、Zod スキーマ
   （`z.infer` が型の単一ソース）と Result パターンの関数を書く。`throw` 禁止。
2. **ハンドラに登録** — `cli/commands/<category>-handlers.ts`（例: `public-handlers.ts`）の
   map に `handler("./<category>/<command>.js", "<fnName>", extract)` でエントリを追加する。
   trade は `tradeHandler(...)`、profile はインライン handler を使う（同じファイルの既存エントリに倣う）。
3. **registry は自動集約** — `cli/commands/registry.ts` が各 `*-handlers.ts` を
   `COMMANDS` / `TRADE_COMMANDS` / `PAPER_COMMANDS` / `PROFILE_COMMANDS` にまとめます。
   **`cli/index.ts` は変更不要**（ルーティングは `router.ts` が registry を参照して行う）。
4. **テストを追加** — `cli/__tests__/` に追加し、実 API はモックする。

> 詳細な規約（HTTP ヘルパーの選択、trade の安全ガード、日付キーの TZ など）は
> 正典の [`.claude/rules/commands.md`](../.claude/rules/commands.md) を参照してください。
> 本ガイドと食い違う場合は `commands.md` が優先されます。

### コマンド実装テンプレート

```typescript
import { z } from "zod";
import { publicGet } from "../../http.js";
import type { Result } from "../../types.js";

const MySchema = z.object({
  field1: z.string(),
  field2: z.number(),
});

type MyData = z.infer<typeof MySchema>;

export async function myCommand(
  pair: string,
  opts?: { timeout?: number },
): Promise<Result<MyData>> {
  const res = await publicGet<{ data: unknown }>(
    `/${pair}/my-endpoint`,
    opts,
  );
  if (!res.success) return res;
  const parsed = MySchema.safeParse(res.data.data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }
  return { success: true, data: parsed.data };
}
```

### 規約チェックリスト

- [ ] 1 ファイル 100 行を目安（超過時はファイル冒頭に理由コメント）
- [ ] Zod スキーマ + `z.infer`（手動 interface 禁止）
- [ ] Result パターン（throw 禁止）
- [ ] `--format=json|table|csv` 対応
- [ ] テスト追加（API モック使用）

---

## 4. 出力パイプライン

CLI の出力は `--format` でフォーマットを選べます。これを活用してパイプラインを組めます:

```bash
# JSON で取得 → jq でフィルタ
npx bitbank ticker btc_jpy --format=json | jq '.last'

# CSV で取得 → スプレッドシートにインポート
npx bitbank candles btc_jpy --type=1day --format=csv > btc_daily.csv

# テーブル形式で確認
npx bitbank assets --format=table
```

---

## 5. CI / 自動化での利用

```bash
# GitHub Actions 等で定期的に価格データを取得
bitbank candles btc_jpy --type=1hour --format=json > data.json

# Private API を使う場合は環境変数で認証
BITBANK_API_KEY=${{ secrets.BB_KEY }} \
BITBANK_API_SECRET=${{ secrets.BB_SECRET }} \
bitbank assets --format=json
```
