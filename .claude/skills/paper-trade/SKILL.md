---
name: paper-trade
description: |
  ペーパートレード（仮想資金）で売買を練習・検証する。
  bitbank の live ticker を取得して、その last 価格に対する成行注文を
  即時 fill する形で残高と履歴を更新する。実 API は public のみ叩き、
  private/trade エンドポイントには一切触れない。
  「BTC を仮想で 0.01 買って」「ペーパー口座の残高見て」
  「練習用に 100万円で始めたい」「仮想で sell シミュレーションして」
  「paper trade-history 見せて」「仮想口座リセットして」
  のような発話で起動する。
  実発注（`bitbank trade ...`）とは別物で、状態は CLI 側のローカルファイル
  （`~/.bitbank/paper-state.json`）に保存される。
compatibility: |
  Requires bitbank CLI (npx tsx cli/index.ts). Node.js 18+.
  Public API のみ使用するため `.env` は不要。
metadata:
  author: bitbank-aiforge
  version: "1.0"
---

# ペーパートレード Skill

実勢価格を引きながら、仮想資金でだけ売買をシミュレートする。
本体は `bitbank paper <cmd>` サブコマンド群。Skill はモデルが
自然言語をこのコマンドに変換するための指示書であり、計算ロジックは
持たない。

## 前提

- `~/.bitbank/paper-state.json` に状態（残高・履歴）が保存される。
  XDG が設定されていれば `$XDG_DATA_HOME/bitbank/paper-state.json` が優先
- 実発注（`bitbank trade ...`）とは完全に独立。paper はライブ価格を
  読むだけで、private/trade エンドポイントは絶対に叩かない
- MVP は **成行（market）のみ**。指値・ストップ・OCO は未対応

## 実行フロー

### Step 1: 初期化済みかを確認

ユーザーが残高や履歴を聞いてきた場合は、まず以下を試す:

```bash
npx tsx cli/index.ts paper assets --format=json
```

`success: false` で `not initialized` が返ったら、初期 JPY をユーザーに
確認したうえで `paper init` を案内する。デフォルト額を勝手に決めない。

### Step 2: 仮想口座を初期化

```bash
npx tsx cli/index.ts paper init --jpy=1000000 --format=json
```

既存 state があると Err になる。上書きしたい場合は `--force` を付ける。

### Step 3: 仮想注文を発注

ユーザー意図（「BTC を 0.01 買って」等）を以下にマップする:

```bash
npx tsx cli/index.ts paper create-order \
  --pair=btc_jpy --side=buy --type=market --amount=0.01 --format=json
```

- live の `bitbank ticker <pair>` 相当の last 価格で即時 fill される
- bitbank 公称テイカー手数料（0.12%）が JPY 建てで差し引かれる
- 残高不足は `success: false` で `error.message` に "insufficient ..." が入る

### Step 4: 残高 / 履歴の確認

```bash
npx tsx cli/index.ts paper assets --format=json
npx tsx cli/index.ts paper trade-history --format=json
```

### Step 5: リセット（必要な場合のみ）

```bash
npx tsx cli/index.ts paper reset --confirm --format=json
```

`--confirm` なしでは Err。実発注の `withdraw` と同じ思想で誤爆を防ぐ。

## 出力フォーマット

CLI を呼ぶときは必ず `--format=json` を付ける（共通規約。
`_shared/references/cli-conventions.md` 参照）。`table` / `csv` は
人間向けなのでモデルがパースしない。

## Gotchas

- **実 API は叩かない。** paper サブコマンドは public ticker しか触らない。
  「実発注して」と頼まれた場合は `bitbank trade create-order ...` 側に
  誘導する。paper では `--execute` は存在しない（必要ない）
- **指値・ストップは未対応。** `--type=limit` を渡すと zod で弾かれる。
  ユーザーが指値を希望した場合は「MVP では成行のみ。次タスクで対応予定」と
  伝える
- **残高不足は throw ではなく Err。** `success: false` の `error.message`
  をそのまま見せる。リトライしない
- **手数料は近似。** MVP は固定テイカーレート（0.0012）。約定ロジックは
  last 即 fill のためスリッページは入っていない。
  実勢との差分はユーザーに明示する
- **パスは `~/.bitbank/paper-state.json`。** 削除したい場合は
  `paper reset --confirm` を使う（手で消さなくてよい）
- **paper の trade-history と private の trade-history は別物。**
  前者は仮想履歴、後者は実約定履歴。ユーザー発話から取り違えない
