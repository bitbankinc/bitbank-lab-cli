# コマンド追加手順

## 分類

| カテゴリ | ディレクトリ | CLI 呼び出し | 認証 | 説明 |
|---------|------------|-------------|------|------|
| public | `cli/commands/public/` | `bitbank <cmd>` | 不要 | 公開マーケットデータ（ticker, candles 等）。WebSocket 経由のライブ購読 `bitbank stream` / `bitbank watch <channel> <pair>` も同カテゴリ。`periodical-brief` だけは指標計算を伴う（[ADR-008](../../docs/adr/008-periodical-brief-indicators-in-cli.md) の例外。計算本体は `cli/brief/`、登録は `public-brief-handler.ts`） |
| private | `cli/commands/private/` | `bitbank <cmd>` | 必要 | アカウント情報の読み取り（assets, orders 等）。`balance-history` だけは復元計算を伴う（[ADR-007](../../docs/adr/007-balance-history-reconstruction-in-cli.md) の例外。計算本体は `cli/portfolio/`） |
| trade | `cli/commands/trade/` | `bitbank trade <cmd>` | 必要 | 資金に影響する操作（create-order, cancel-order 等） |
| paper | `cli/commands/paper/` | `bitbank paper <cmd>` | 不要 | 仮想資金での練習用（ライブ価格 × ローカル state、実 API は public ticker のみ） |
| profile | `cli/commands/profile/` | `bitbank profile <cmd>` | 不要 | API キー切替用プロファイル管理（`profiles.json` 0600 / atomic write、API は叩かない） |
| tax | `cli/commands/tax/` | `bitbank tax <cmd>` | 必要 | 税務・会計データ整形（[ADR-004](../../docs/adr/004-tax-logic-in-cli-exception.md) の例外。**private GET のみ・POST は絶対に叩かない**）。計算本体は `cli/tax/` |
| meta | （登録なし、`router.ts` の `handleSpecialCommand` で振り分け） | `bitbank <cmd>` | 不要 | API を叩かないユーティリティ（`schema`, `profiles`, `completion`） |

メタコマンドは bitbank API ではなく CLI 自体の情報（コマンド一覧・補完スクリプト）を返す。
`COMMANDS` / `TRADE_COMMANDS` / `PAPER_COMMANDS` / `PROFILE_COMMANDS` / `TAX_COMMANDS` には登録せず、`router.ts` の `handleSpecialCommand` で個別にディスパッチする。

`profile`（単数形）と `profiles`（複数形）は別物なので注意:
- `profile <subcommand>` は `PROFILE_COMMANDS` に登録される profile カテゴリ（add / list / show / remove / set-default）。実体は `cli/commands/profile/`
- `profiles` は legacy meta コマンドで `cwd` 配下の `.env.*` ファイル一覧を返すだけ。`router.ts` の `handleSpecialCommand` で個別ディスパッチされ、registry には入らない。新規に `profiles` を再登録しない


trade / paper / profile / tax だけサブコマンド形式にしているのは、フラット一覧での誤爆を減らすため（discoverability・視覚的警告）。
グループ名の一覧は `router.ts` の `GROUP_REGISTRY` が単一ソース（`resolveCommand` が返す `group`）。
trade の安全ガード自体は `--execute` / `--confirm` フラグ側にある（`trading-safety.md`）。
paper は実 API を叩かないため `--execute` は存在しないが、`reset` のみ `--confirm` を必須にして state の誤削除を防ぐ。
profile は実 API を叩かないが、`remove` のみ `--confirm` を必須にして profile の誤削除を防ぐ。secret は flag 受け禁止（shell 履歴に残るため）、env か対話 hidden 入力のみ。
tax は読み取り専用（private GET のみ）なので `--execute` / `--confirm` は無い。代わりに**参考損益の表示ガード**を持ち、
アテステーション（`--attest`）・未解決入庫の不在・前年繰越の確定・残高突合の一致がすべて揃った銘柄でのみ数値を出す。
`tax verify-report` はユーザー指定の CSV（bitbank 公式の年間取引報告書。現物 `--csv` / 信用 `--margin-csv` の 2 種）を**読むだけ**で、書き出し・送信はしない。
CSV はコマンド層で読んでから API を叩く（壊れた CSV で認証・レート制限を消費しないため）。
販売所（即時売買）の取引は API に一切現れないため、`--brokerage-csv`（売買履歴 CSV）が
events / reconcile / pnl / verify-report の 4 本すべてに付く。これも読むだけ。

## 新規コマンド追加手順

1. 適切なカテゴリのディレクトリにファイルを作成
2. Zod でリクエスト/レスポンススキーマを定義（手動 interface 禁止）
3. Result パターンで返す（throw 禁止）
4. `--format=json|table|csv` オプションをサポート（デフォルト json）
5. `cli/commands/<category>/index.ts` にエクスポートを追加しない（自動検出）
6. ハンドラ登録: public/private は `cli/commands/registry.ts` の `COMMANDS`、trade は `TRADE_COMMANDS`、paper は `PAPER_COMMANDS`、profile は `PROFILE_COMMANDS`、tax は `TAX_COMMANDS` に入る
7. schema 登録: `cli/commands/schema/defs-<category>.ts` に params / output を足し、
   `cli/commands/schema/registry.ts` の `DEFS` に並べる（下記「schema カタログの登録」）
8. `npx tsx scripts/gen-agents-catalog.ts` で `agents/` を再生成してコミット
9. `cli/__tests__/` にテストを追加
10. 1 ファイル 100 行を目安。超えたら分割を検討。分割が不自然な場合は
    ファイル冒頭にコメントで理由を明記すれば許容（CLAUDE.md 参照）

## schema カタログの登録

`ALL_SCHEMAS`（`cli/commands/schema/registry.ts`）は **呼び出しパスをキーにする**。
サブコマンドは `cli/commands/schema/types.ts` の `schemaKey()` が `category` から
`"paper assets"` のように名前空間を付ける。defs ファイル側は素の名前で書けばよく、
prefix を手で付けない。

- `SUBCOMMAND_GROUPS`（types.ts）は router.ts の `GROUP_REGISTRY` と対。
  グループ名は category 名と一致させる
- キーが衝突した定義は捨てられ、`SCHEMA_KEY_COLLISIONS` に記録される。
  `cli/__tests__/schema-registry.test.ts` が「衝突ゼロ」「キー数 = 各 defs の合計」
  「登録済みサブコマンドが全てカタログに載る」を検査する
- 位置引数（`bitbank profile show <name>`）は `p("string", "...", { positional: true })`
  で宣言する。`--name=` と誤解される表示を避けるための印
- `dangerous` は **trade 専用**。単一ソースは `cli/commands/trade/confirm-guard.ts` の
  `CONFIRM_PHRASES`（`--execute` + 固定フレーズの二段ロック）。paper reset /
  profile remove の `--confirm` は真偽フラグ 1 つで性質が違うので
  `CONFIRM_PHRASES` に足さない。必須である旨は params の description に書く

## HTTP ヘルパー

- public → `cli/http.ts`（認証なし GET）
- private GET → `cli/http-private.ts`（HMAC 認証 GET）
- private POST → `cli/http-private-post.ts`（HMAC 認証 POST）
- trade コマンドは POST ヘルパーを使う

## 日付キーのタイムゾーン

bitbank の candlestick endpoint で使う `YYYYMMDD` / `YYYY` は **UTC 基準**。
公式 docs は timezone 未記載だが、実 API で `/candlestick/1hour/20260101` が
UTC 2026-01-01 00:00〜23:00、`/candlestick/1day/2026` が UTC 月初起点なのを確認済み。

CLI 内では `cli/date-utils.ts` の `ymdUtc` / `yearUtc` / `todayDate` / `nextBoundaryMs`
（および `cache.ts` の `isCompletePeriod`）が UTC 基準で動く。JST は表示・説明用に
のみ使い、API キー組み立てや境界判定には持ち込まない。
