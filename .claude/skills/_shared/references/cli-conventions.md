# CLI 呼び出し規約

全 skill 共通の bitbank CLI 呼び出しルール。SKILL.md からは
`_shared/references/cli-conventions.md` で参照する。

## 起動方法（短縮形と等価形）

- `./install.sh` を一度実行済みなら `bitbank <cmd>` でどのディレクトリからでも
  起動できる（`npm link` で PATH に通っている）
- 未実行の環境では `npx tsx cli/index.ts <cmd>` で同じ呼び出しになる
- 既存 skill 内のコマンド例は `npx tsx cli/index.ts ...` を採用しており、
  どちらの形でも同じコマンドを実行する。skill が出力する例を `bitbank ...`
  形式に書き換えても等価

## 出力フォーマット

- skill から CLI を呼ぶときは **必ず `--format=json`** を付ける
- `table` / `csv` は人間向けの整形であり、モデルがパースする用途では使わない
- JSON 以外をパースしようとすると整形の揺れで壊れるため、例外を作らない

## Result パターン

- 全コマンドは `{ success: true, data: ... }` または
  `{ success: false, error: { code, message } }` を返す
- skill 側は **必ず `success` フィールドを先に確認**してから `data` を読む
- `success: false` の場合、`error.code` でハンドリングを分岐できる
  （例: 60001 = 残高不足、10009 = レート制限）。エラーコードは
  bitbank 公式 [errors.md](https://github.com/bitbankinc/bitbank-api-docs/blob/master/errors.md) を参照
- skill 側のリトライ戦略・カテゴリ別ハンドリングは
  [`error-catalog.md`](./error-catalog.md) に集約。
  「rate_limit はどう待つか」「POST はなぜ自動再送しないか」等はここを見る

## 認証

- `private` / `trade` カテゴリのコマンドは **`--env-file=.env`** が必要
  ```bash
  npx tsx --env-file=.env cli/index.ts assets --format=json
  ```
- `public` カテゴリ（candles / ticker 等）は `.env` 不要
- skill が認証必要かどうかは `.claude/rules/commands.md` のカテゴリ表で判定

## stderr の扱い

- stderr を `2>/dev/null` で握りつぶさない。CLI が警告を出すケース
  （cache 書き込み失敗、リトライ通知等）を見落とす
- stdout の JSON だけをパースし、stderr は観察用にそのまま流す

## trade コマンド

- 資金影響系（`trade create-order` 等）はドライランがデフォルト。skill から
  実発注をしたい場合は `--execute` を明示する
- 詳細は `.claude/rules/trading-safety.md` を参照

## paper コマンド

- ペーパートレード（仮想資金）。`bitbank paper <cmd>` で呼び出す
- 実 API は public ticker のみを叩く（private/trade は触らない）。`.env` 不要
- 状態は `~/.bitbank/paper-state.json`（または `$XDG_DATA_HOME/bitbank/paper-state.json`）
  に保存される
- 主要例:

  ```bash
  npx tsx cli/index.ts paper init --jpy=1000000 --format=json
  npx tsx cli/index.ts paper assets --format=json
  npx tsx cli/index.ts paper create-order \
    --pair=btc_jpy --side=buy --type=market --amount=0.001 --format=json
  npx tsx cli/index.ts paper trade-history --format=json
  npx tsx cli/index.ts paper reset --confirm --format=json
  ```

- MVP では成行（`--type=market`）のみ対応。指値・ストップ等は未実装
- `paper reset` は state の誤削除を防ぐため `--confirm` 必須
