# CLI 呼び出し規約

全 skill 共通の bitbank CLI 呼び出しルール。SKILL.md からは
`_shared/references/cli-conventions.md` で参照する。

## 起動方法の解決手順

skill 実行前に、以下の順で CLI の起動方法を解決する。skill 内のコマンド例は
`bitbank ...` 形式で統一して記述する（手順 1 で解決済みの前提で読む）。

1. **`command -v bitbank` が通る** → そのまま `bitbank <cmd>` を使う
   （`npm i -g bitbank-lab-cli`、または repo で `./install.sh`＝`npm link` 済みの状態）
2. 通らない場合、**カレントが repo checkout**（`package.json` の `name` が
   `bitbank-lab-cli` で、`npm ci` 済み＝`node_modules/` がある）なら
   `npx tsx cli/index.ts <cmd>` で同じ呼び出しになる
3. **どちらも成立しなければ CLI は実行できない**。推測でパスを探し回らず、
   ユーザーに「CLI 本体が未インストールです。`npm i -g bitbank-lab-cli` を
   実行してください（Node.js 22+ が必要）」と案内して停止する

> **plugin cache 環境の注意**: plugin install（Claude Code / Codex / Cursor /
> Antigravity）が配布するのは skills と `agents/` カタログだけで、**CLI の実行に必要な
> 依存（`node_modules`）は含まれない**。plugin cache 内の `bin/bitbank` や
> `cli/index.ts` を直接叩いても `Cannot find module 'tsx/cli'` /
> `Cannot find package 'zod'` で失敗するため、この経路は使わないこと
> （`npx tsx` が導入するのは tsx だけで、zod 等の依存は解決されない）。

## 出力フォーマット

- skill が **one-shot コマンド**（candles / ticker / assets / paper / profile 等）
  を呼ぶときは **必ず `--format=json --machine` を併用する**
- `--machine` は `{ success, data, partial?, meta? }` envelope を **1 行 compact** で吐く
  （機械処理向けの canonical 形）。既定の `--format=json` 単独でも **同じ envelope を
  pretty で返す**ので `meta`（`lastIsIncomplete` / `gaps` / `dedupedCount` / `truncated` や
  取得コンテキスト `request` / `source` / `fetchedAt` / `returnedRows`）は落ちない。
  skill 経路では出力の揺れを抑えるため compact な `--machine` を使う
- `--raw` を付けたときだけ従来どおり `data` のみ（envelope なし・compact、jq パイプ用）
- 例外: `--machine` を **付けない** コマンド:
  - `watch` / `stream`: JSONL・継続ストリーム系。1 行 1 イベントが完結した
    JSON で、envelope の概念がない
  - `completion`: 補完スクリプトを stdout に吐くだけで API も呼ばない
  - `profile add`: secret を対話 hidden 入力で受けるインタラクティブコマンド
- `table` / `csv` は人間向けの整形であり、モデルがパースする用途では使わない
- JSON 以外をパースしようとすると整形の揺れで壊れるため、例外を作らない

### `--machine` envelope の読み方

```bash
bitbank candles btc_jpy --type=1day --format=json --machine
```

成功時:

```json
{
  "success": true,
  "data": [
    { "open": 100, "high": 110, "low": 90, "close": 105, "vol": 50, "timestamp": 1000 },
    { "open": 105, "high": 115, "low": 95, "close": 110, "vol": 60, "timestamp": 2000 }
  ],
  "meta": {
    "lastIsIncomplete": true,
    "gaps": [{ "from": 1735603200000, "to": 1735776000000, "missing": 2 }],
    "dedupedCount": 0
  }
}
```

失敗時:

```json
{ "success": false, "error": "10009: リクエスト頻度過多", "exitCode": 3 }
```

skill 側のパース規律:

- **必ず `success` を先に確認**してから値を読む（`false` なら `error` 文字列を見て、
  必要に応じて [`error-catalog.md`](./error-catalog.md) のカテゴリで分岐）
- 値は `data` から取り出す。candles の `data` は平坦な配列で、各行は
  `{open, high, low, close, vol, timestamp}` オブジェクト（`result.data[0].open` の
  ように直接読む。timestamp はミリ秒 UNIX/UTC、配列は昇順＝古い順。`data.candlestick`
  は存在しない）。エンドポイント別の配列順序は `bitbank-api-formats.md` の「配列順序」を参照
- 数値フィールドは CLI が number に正規化済みで `Number(...)` / `parseFloat(...)` は不要。
  ただし末尾ゼロ・極小値・極大桁では表現/精度の限界がある（`bitbank-api-formats.md`
  「精度・表現の限界」参照）。RSI / SMA 等の指標計算は float64 で問題ないが、桁固定の
  表示・桁数まで含めた照合には raw 確認 or 丸め前提で臨む
- `meta` が存在する場合は **必ず確認** する。とくに candles では以下を扱う:
  - `lastIsIncomplete: true` → 末尾足が未確定。指標・統計から落とすか「未確定」を明示
  - `gaps: [...]` → 欠損足あり。区間と件数をユーザーに報告し、結合・補間の要否を判断
  - `dedupedCount > 0` → 結合時に除去した重複足の件数（取得側の整合性確認）
  - `truncated: true` → ハードリミットで切り詰めた（`requestedLimit` / `returnedRows` を併記）
- `partial: true` がある場合は一部 fetch が失敗している。データ完全性が必要な
  分析では再取得 or 部分結果である旨をユーザーに明示する
- public / private の取得系コマンドは `meta` に取得コンテキストも付ける:
  `request`（叩いたコマンドと該当時の `pair` / `type` / `date` / `from` / `to` / `limit`）、
  `source`（`"public"` / `"private"`）、`timezone`（`"UTC"`）、`fetchedAt`（取得時刻 ISO 8601）、
  `returnedRows`（配列結果の件数）。再現性・鮮度の確認に使う（売買判断には使わない）

## Result パターン

- one-shot CLI は `--machine` 経由で `{ success, data, partial?, meta? }` /
  `{ success: false, error, exitCode }` の envelope を返す（上記参照）
- `error` は文字列（通常例: `"60001: 残高不足"`）。通常は先頭の数値がエラーコード。
  **public / private とも同じ `"<code>: <和訳>"` 形式**で返る。ただしコードマッピング
  未登録時は `"API error: <code>"`（先頭が数値にならない例外）
- skill 側のリトライ戦略・カテゴリ別ハンドリングは
  [`error-catalog.md`](./error-catalog.md) に集約。
  「rate_limit はどう待つか」「POST はなぜ自動再送しないか」等はここを見る

## 認証

`private` / `trade` カテゴリのコマンドは API キー / シークレットが必要。`public` / `paper` カテゴリは不要。skill が認証必要かどうかは `.claude/rules/commands.md` のカテゴリ表で判定。

### 主: profile（推奨）

`profiles.json`（`~/.bitbank/profiles.json`、0600 / atomic write）に複数の key/secret を登録して切り替える。

```bash
# 一度だけ登録（secret は対話 hidden 入力。flag では受けない）
bitbank profile add main

# default profile が自動で使われる
bitbank assets --format=json --machine

# 別 profile に切り替える
bitbank --profile=sub assets --format=json --machine

# env で切り替えてセッションを通す
BITBANK_PROFILE=sub bitbank assets --format=json --machine
```

解決優先度: `--profile=<name>` flag → `BITBANK_PROFILE` env → default profile → legacy env vars。

### 副: legacy env vars（後方互換）

profile を一度も登録していない環境では従来通り env vars でも動く。

```bash
set -a; source .env; set +a
bitbank assets --format=json --machine
```

`set -a` 以降は `source` で読まれた変数が自動的に export される（`set +a` で戻す）。bash / zsh で動作する。CI 環境などで profile を使えない場合のフォールバックとして利用する。

## stderr の扱い

- stderr を `2>/dev/null` で握りつぶさない。CLI が警告を出すケース
  （cache 書き込み失敗、リトライ通知等）を見落とす
- stdout の JSON だけをパースし、stderr は観察用にそのまま流す

## trade コマンド

- 資金影響系（`trade create-order` 等）はドライランがデフォルト。skill から
  実発注をしたい場合は `--execute` に加えてコマンドごとの固定フレーズを
  `--confirm=<phrase>` で渡す二段確認が必要（例: `--confirm=I-UNDERSTAND-CREATE-ORDER`）
- 詳細とフレーズ一覧は `.claude/rules/trading-safety.md` を参照

## paper コマンド

- ペーパートレード（仮想資金）。`bitbank paper <cmd>` で呼び出す
- 実 API は public ticker のみを叩く（private/trade は触らない）。`.env` 不要
- 状態は `~/.bitbank/paper-state.json`（または `$XDG_DATA_HOME/bitbank/paper-state.json`）
  に保存される
- 主要例:

  ```bash
  bitbank paper init --jpy=1000000 --format=json --machine
  bitbank paper assets --format=json --machine
  # 成行
  bitbank paper create-order \
    --pair=btc_jpy --side=buy --type=market --amount=0.001 --format=json --machine
  # 指値（GTC）
  bitbank paper create-order \
    --pair=btc_jpy --side=buy --type=limit --price=10000000 --amount=0.001 --format=json --machine
  bitbank paper active-orders --format=json --machine
  bitbank paper cancel-order --id=<id> --format=json --machine
  bitbank paper tick --format=json --machine
  bitbank paper trade-history --format=json --machine
  bitbank paper pnl --format=json --machine
  bitbank paper reset --confirm --format=json --machine
  ```

- 成行は ticker last 価格で即時 fill。指値は `openOrders` に積み、`paper tick` または lazy tick（assets / trade-history / active-orders / create-order 呼出時に裏で実行）で 1m 足を遡って fill を解決する
- `paper reset` は state の誤削除を防ぐため `--confirm` 必須
- 指値は部分約定・ストップ・OCO 未対応（GTC のみ）

## shell 補完

- `bitbank completion <bash|zsh>` で補完スクリプトを stdout に出す（API は叩かない）。
  インストール手順は README の「Shell 補完」を参照

## watch コマンド（ライブ ticker）

- `bitbank watch ticker <pair>` で WebSocket ベースのライブ ticker 購読を開始する
- `--format=json` を付けると 1 イベント 1 行 JSONL が stdout に流れる（pipe 向け）
- **`--machine` は付けない**: JSONL ストリームは 1 行 1 イベントが完結した
  JSON であり、envelope 化する仕様にしていない（出力フォーマット節の例外）
- TTY なら既定で `--format=table`（ANSI で 1 行を再描画）
- 長時間動き続けるため、skill から呼ぶときは **必ず `--duration=<秒>` か
  `--count=<件>` のいずれかを併用する**（無限実行を避ける）
- 主要例:

  ```bash
  # 5 秒間 ticker を JSONL で取得
  bitbank watch ticker btc_jpy --duration=5 --format=json
  # 10 イベント取得して終了
  bitbank watch ticker btc_jpy --count=10 --format=json
  # last だけ抽出
  bitbank watch ticker btc_jpy --duration=10 --format=json | jq -r '.last'
  ```

- 切断時は指数バックオフで自動再接続（1, 2, 4, 8, 16, 32, 32...）。
  `--max-retries=<n>` で上限を設定できる。上限到達時は exit code 5
- 無音検出は `--idle-timeout=<秒>`（既定 30）で発火し、再接続フローに入る

