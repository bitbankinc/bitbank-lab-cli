# CLI 呼び出し規約

全 skill 共通の bitbank CLI 呼び出しルール。SKILL.md からは
`_shared/references/cli-conventions.md` で参照する。

## 起動方法（短縮形と等価形）

- `./install.sh` を一度実行済みなら `bitbank <cmd>` でどのディレクトリからでも
  起動できる（`npm link` で PATH に通っている）
- 未実行の環境では `npx tsx cli/index.ts <cmd>` で同じ呼び出しになる
- skill 内のコマンド例は `bitbank ...` 形式で統一して記述する

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
  bitbank paper init --jpy=1000000 --format=json
  bitbank paper assets --format=json
  # 成行
  bitbank paper create-order \
    --pair=btc_jpy --side=buy --type=market --amount=0.001 --format=json
  # 指値（GTC）
  bitbank paper create-order \
    --pair=btc_jpy --side=buy --type=limit --price=10000000 --amount=0.001 --format=json
  bitbank paper active-orders --format=json
  bitbank paper cancel-order --id=<id> --format=json
  bitbank paper tick --format=json
  bitbank paper trade-history --format=json
  bitbank paper pnl --format=json
  bitbank paper reset --confirm --format=json
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

