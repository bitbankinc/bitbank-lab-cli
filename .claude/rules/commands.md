# コマンド追加手順

## 分類

| カテゴリ | ディレクトリ | CLI 呼び出し | 認証 | 説明 |
|---------|------------|-------------|------|------|
| public | `cli/commands/public/` | `bitbank <cmd>` | 不要 | 公開マーケットデータ（ticker, candles 等）。WebSocket 経由のライブ購読 `bitbank stream` / `bitbank watch <channel> <pair>` も同カテゴリ |
| private | `cli/commands/private/` | `bitbank <cmd>` | 必要 | アカウント情報の読み取り（assets, orders 等） |
| trade | `cli/commands/trade/` | `bitbank trade <cmd>` | 必要 | 資金に影響する操作（create-order, cancel-order 等） |
| paper | `cli/commands/paper/` | `bitbank paper <cmd>` | 不要 | 仮想資金での練習用（ライブ価格 × ローカル state、実 API は public ticker のみ） |
| profile | `cli/commands/profile/` | `bitbank profile <cmd>` | 不要 | API キー切替用プロファイル管理（`profiles.json` 0600 / atomic write、API は叩かない） |
| meta | （登録なし、`router.ts` の `handleSpecialCommand` で振り分け） | `bitbank <cmd>` | 不要 | API を叩かないユーティリティ（`schema`, `profiles`, `completion`） |

メタコマンドは bitbank API ではなく CLI 自体の情報（コマンド一覧・補完スクリプト）を返す。
`COMMANDS` / `TRADE_COMMANDS` / `PAPER_COMMANDS` / `PROFILE_COMMANDS` には登録せず、`router.ts` の `handleSpecialCommand` で個別にディスパッチする。

`profile`（単数形）と `profiles`（複数形）は別物なので注意:
- `profile <subcommand>` は `PROFILE_COMMANDS` に登録される profile カテゴリ（add / list / show / remove / set-default）。実体は `cli/commands/profile/`
- `profiles` は legacy meta コマンドで `cwd` 配下の `.env.*` ファイル一覧を返すだけ。`router.ts` の `handleSpecialCommand` で個別ディスパッチされ、registry には入らない。新規に `profiles` を再登録しない


trade / paper / profile だけサブコマンド形式にしているのは、フラット一覧での誤爆を減らすため（discoverability・視覚的警告）。
trade の安全ガード自体は `--execute` / `--confirm` フラグ側にある（`trading-safety.md`）。
paper は実 API を叩かないため `--execute` は存在しないが、`reset` のみ `--confirm` を必須にして state の誤削除を防ぐ。
profile は実 API を叩かないが、`remove` のみ `--confirm` を必須にして profile の誤削除を防ぐ。secret は flag 受け禁止（shell 履歴に残るため）、env か対話 hidden 入力のみ。

## 新規コマンド追加手順

1. 適切なカテゴリのディレクトリにファイルを作成
2. Zod でリクエスト/レスポンススキーマを定義（手動 interface 禁止）
3. Result パターンで返す（throw 禁止）
4. `--format=json|table|csv` オプションをサポート（デフォルト json）
5. `cli/commands/<category>/index.ts` にエクスポートを追加しない（自動検出）
6. ハンドラ登録: public/private は `cli/commands/registry.ts` の `COMMANDS`、trade は `TRADE_COMMANDS`、paper は `PAPER_COMMANDS`、profile は `PROFILE_COMMANDS` に入る
7. `cli/__tests__/` にテストを追加
8. 1 ファイル 100 行を目安。超えたら分割を検討。分割が不自然な場合は
   ファイル冒頭にコメントで理由を明記すれば許容（CLAUDE.md 参照）

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
