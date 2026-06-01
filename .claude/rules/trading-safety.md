# 取引安全ガード

ここで定義する個々のガード（ドライラン / `--execute` / `--confirm` / POST 非冪等）を、
read-only profile → paper → dry-run → 本番という 1 本の運用手順に連結したものが
[`docs/botter-runbook.md`](../../docs/botter-runbook.md)。bot 運用の導線はそちらを参照。

## 対象コマンド

`trade create-order`, `trade cancel-order`, `trade cancel-orders` は資金に影響する trade サブコマンド（`bitbank trade <cmd>` で呼び出す）。

注: サブコマンド形式は discoverability と視覚的な警告が目的で、実行ガードではない。実際の安全ガードは以下 `--execute` / `--confirm` フラグ側にある。

## ドライラン（デフォルト）

- `--execute` フラグなしでは **API を叩かない**
- `cli/commands/trade/dry-run.ts` でドライラン出力を生成
- ドライラン時は「実行するには --execute と --confirm=<phrase> を付けてください」と表示

## --execute フラグ

- 付与時のみ実際の API リクエストを送信
- ただし `--execute` 単独では POST に到達しない。下記 `--confirm` も必須
- コマンド実装では Zod スキーマで `execute` / `confirm` を一括検証してから送信

## --confirm=<phrase> フラグ（二段確認）

- `--execute` と同時に固定フレーズを渡したときだけ実 POST に到達する
- LLM / スクリプト / 誤コピーから confirm なしで実注文・キャンセル・入金確認が
  発火するリスクを下げるための二段ロック
- フレーズは `cli/commands/trade/confirm-guard.ts` の `CONFIRM_PHRASES` が
  単一ソース。コマンドハンドラで生 if 比較せず、`refineExecuteConfirm()` を
  各 Zod スキーマの `.superRefine()` から呼ぶ
- フレーズは secret ではなく flag 値（shell 履歴に残るのは許容）

| コマンド | フレーズ |
|---|---|
| `trade create-order` | `I-UNDERSTAND-CREATE-ORDER` |
| `trade cancel-order` | `I-UNDERSTAND-CANCEL-ORDER` |
| `trade cancel-orders` | `I-UNDERSTAND-CANCEL-ORDERS` |
| `trade confirm-deposits` | `I-UNDERSTAND-CONFIRM-DEPOSITS` |
| `trade confirm-deposits-all` | `I-UNDERSTAND-CONFIRM-DEPOSITS-ALL` |

挙動マトリクス:

| `--execute` | `--confirm=<correct>` | 結果 |
|:-:|:-:|---|
| なし | -（任意） | ドライラン |
| あり | なし | error（API を叩かない） |
| あり | 不一致 | error（API を叩かない） |
| あり | 一致 | 実 POST |

## POST のリトライ無効化（冪等性の保護）

- bitbank API は `Idempotency-Key` 相当のヘッダを受け付けない
- POST はサーバ側で副作用が発生し得るため、`cli/http-private-post.ts` は
  `retries: 0` と `retryOnNetworkError: false` を強制している
- trade コマンドはネットワーク例外（タイムアウト・ECONNRESET 等）でも
  自動再送しない。CLI が「失敗」を返しても、注文や出金が実際には通って
  いる可能性がある（silent success）
- タイムアウトや 5xx を受け取った場合は、再実行する前に必ず
  `bitbank active-orders` / `bitbank trade-history` / `bitbank assets`
  などで実際の状態を確認すること

## 実装チェックリスト（新規 trade コマンド追加時）

1. `dry-run.ts` のドライラン表示を実装
2. `--execute` なしでドライランになることをテストで確認
3. 資金移動を伴う場合は `--confirm` ガードも追加
   3.5. `cli/commands/trade/confirm-guard.ts` の `CONFIRM_PHRASES` に
        コマンドごとの固定フレーズ（例: `I-UNDERSTAND-<COMMAND-NAME>`）を追加し、
        Zod スキーマの `.superRefine()` から `refineExecuteConfirm(command)`
        を呼ぶ
4. テストでは実 API を叩かない（モック使用）。`--execute` 単独 / `--confirm`
   不一致でも fetch が呼ばれないことを mock で検証する
