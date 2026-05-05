# コマンド追加手順

## 分類

| カテゴリ | ディレクトリ | CLI 呼び出し | 認証 | 説明 |
|---------|------------|-------------|------|------|
| public | `cli/commands/public/` | `bitbank <cmd>` | 不要 | 公開マーケットデータ（ticker, candles 等） |
| private | `cli/commands/private/` | `bitbank <cmd>` | 必要 | アカウント情報の読み取り（assets, orders 等） |
| trade | `cli/commands/trade/` | `bitbank trade <cmd>` | 必要 | 資金に影響する操作（create-order, withdraw 等） |
| paper | `cli/commands/paper/` | `bitbank paper <cmd>` | 不要 | 仮想資金での練習用（ライブ価格 × ローカル state、実 API は public ticker のみ） |

trade / paper だけサブコマンド形式にしているのは、フラット一覧での誤爆を減らすため（discoverability・視覚的警告）。
trade の安全ガード自体は `--execute` / `--confirm` フラグ側にある（`trading-safety.md`）。
paper は実 API を叩かないため `--execute` は存在しないが、`reset` のみ `--confirm` を必須にして state の誤削除を防ぐ。

## 新規コマンド追加手順

1. 適切なカテゴリのディレクトリにファイルを作成
2. Zod でリクエスト/レスポンススキーマを定義（手動 interface 禁止）
3. Result パターンで返す（throw 禁止）
4. `--format=json|table|csv` オプションをサポート（デフォルト json）
5. `cli/commands/<category>/index.ts` にエクスポートを追加しない（自動検出）
6. ハンドラ登録: public/private は `cli/commands/registry.ts` の `COMMANDS`、trade は `TRADE_COMMANDS`、paper は `PAPER_COMMANDS` に入る
7. `cli/__tests__/` にテストを追加
8. 1 ファイル 100 行を目安。超えたら分割を検討。分割が不自然な場合は
   ファイル冒頭にコメントで理由を明記すれば許容（CLAUDE.md 参照）

## HTTP ヘルパー

- public → `cli/http.ts`（認証なし GET）
- private GET → `cli/http-private.ts`（HMAC 認証 GET）
- private POST → `cli/http-private-post.ts`（HMAC 認証 POST）
- trade コマンドは POST ヘルパーを使う
