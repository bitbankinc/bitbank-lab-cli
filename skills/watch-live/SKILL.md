---
name: watch-live
description: |
  bitbank の WebSocket public stream で ticker をリアルタイム watch する。
  Skill 経路では必ず `--duration` か `--count` で停止条件を与える
  （長時間動き続けるため）。
  代表トリガー: 「BTC の ticker をライブで見たい」「リアルタイム価格監視」
  「ライブで last を 10 秒だけ見たい」
  注意: 指標の現在値（RSI / SMA 等）は indicator-analysis、
  ローソク足ベースの分析は他 skill。本 skill は WS 取得手段に特化。
compatibility: |
  Requires bitbank CLI. Node.js 22+.
metadata:
  author: bitbank-aiforge
  version: "1.0"
---

# Watch Live Skill

WebSocket 経由で bitbank の `ticker_<pair>` チャネルを購読し、JSONL
（または table）でライブ配信する。`bitbank watch ticker <pair>` を呼び出す。

## いつ使うか

代表トリガー以外にも以下のような発話で起動する:

- 「last の動きをストリームで取りたい」「spread をライブで監視」
- 「vol を監視して」

## 実行フロー

### Plan

1. ユーザーの目的を確認（last 値の追跡 / spread 観察 / vol 監視 など）。
2. **必ず停止条件を決める**:
   - 短時間サンプリング: `--duration=<秒>`（例: 10 秒）
   - 件数固定: `--count=<件>`（例: 20 イベント）
   - 両方併用も可（早く来た方で止まる）
3. Skill 経路では `--format=json` を付けて JSONL を取得し、`jq` などで
   後処理する。**`--machine` は付けない**: JSONL は 1 行 1 イベントが完結した
   JSON で envelope の概念がないため、共通規約（`_shared/references/cli-conventions.md`）
   でも `watch` / `stream` は `--machine` 例外として明記されている。

### Validate

- pair が `_shared/references/pair-classification.md` の有効ペアか確認。
- `--duration` または `--count` のどちらかが指定されているか確認
  （無指定なら追加で確認する）。

### Execute

```bash
# 10 秒間 last を追跡
bitbank watch ticker btc_jpy --duration=10 --format=json | jq '{ts,last,bid,ask}'

# 20 件取得して終了
bitbank watch ticker eth_jpy --count=20 --format=json
```

`--max-retries=<n>` で再接続上限、`--idle-timeout=<秒>` で無音検出を
カスタマイズ可能（既定: 無制限 / 30 秒）。

## 出力フォーマット

JSONL（1 行 1 イベント）:

```json
{"ts":"2026-05-06T10:00:00.000Z","pair":"btc_jpy","last":"...","bid":"...","ask":"...","high":"...","low":"...","vol":"..."}
```

table モードは TTY 向け（ANSI 再描画）。Skill 経路では使わない。

## 終了条件と exit code

| 条件 | exit code |
|-----|-----------|
| `--duration` 経過 | 0 |
| `--count` 到達 | 0 |
| SIGINT / SIGTERM | 0 |
| `--max-retries` 到達 | 5（network） |
| 不正な channel（ticker 以外） | 4（param） |

## Gotchas

- **無限実行注意**: `--duration` も `--count` も付けないと SIGINT を送る
  まで止まらない。Skill 経路では必ずどちらかを付ける。
- **MVP は ticker のみ**: `bitbank watch depth ...` などは未対応。
  depth / transactions が必要な場合は `bitbank stream <pair>` を使う。
- **stderr は運用ログ**: 接続成功 / 切断 / 再接続 / 無音タイムアウトは
  stderr に出る。stdout は純粋に JSONL のみ。
- **再接続中のメッセージは欠落する**: 再接続成功までの間のイベントは
  取得できない。ギャップの厳密性が必要なら REST の `transactions` を併用。
- **timestamp は bitbank サーバ提供**: ms 単位の epoch を ISO 8601 化する
  （ローカル時計には依存しない）。
- private チャネル（orders / executions）は本 skill の対象外。
