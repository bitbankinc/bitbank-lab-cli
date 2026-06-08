---
description: bitbank CLI の最初の一歩。認証なしで市況を取得し、出力フォーマットを切り替え、自然言語で操作するまでをざっと体験します。
---

# クイックスタート

[インストール](install.md) が済んだら、まずは認証不要の Public コマンドから始めましょう。API キーは不要です。

## 1. 市況を取得する

```bash
# 単一ペアのティッカー
bitbank ticker btc_jpy

# ローソク足（OHLCV）を見やすいテーブルで
bitbank candles btc_jpy --type=1day --format=table

# 全 JPY ペアのティッカーを一括取得
bitbank tickers-jpy
```

ペアは `btc_jpy` / `eth_jpy` のように `<base>_<quote>` 形式で指定します。利用可能なペアは `bitbank pairs` で確認できます。

## 2. 出力フォーマットを切り替える

すべてのコマンドで `--format` が使えます。デフォルトは `json` です。

```bash
bitbank ticker btc_jpy --format=json   # デフォルト（プログラム向け）
bitbank ticker btc_jpy --format=table  # 人が読みやすいテーブル
bitbank ticker btc_jpy --format=csv    # パイプ・インポート向け
```

`json` は `jq` でフィルタしたり、`csv` はファイルに保存して表計算ソフトに取り込んだりできます。

```bash
# jq で last（最終取引価格）だけ抜き出す
bitbank ticker btc_jpy | jq '.last'

# 日足を CSV に保存
bitbank candles btc_jpy --type=1day --format=csv > btc_daily.csv
```

{% hint style="info" %}
スクリプトや Agent Skill から読む場合は `--format=json --machine` を併用すると、`{ success, data, meta }` の envelope が得られ、データ完全性のメタ情報まで取れます。詳しくは [基本的な使い方](../guides/usage.md) を参照してください。
{% endhint %}

## 3. 自然言語で操作する（Agent Skills）

Claude Code / Cursor でこのリポジトリを開くと、Agent Skills が自動で有効になります。自然言語でリクエストすれば、Skill が必要な CLI コマンドを組み立てて実行します。

```text
「BTC の RSI を見て」
「ポートフォリオの状況を見せて」
「SMA クロス戦略をバックテストして」
```

搭載している Skill の一覧は [Agent Skills](../guides/skills.md) を参照してください。

## 4. 仮想資金で売買を練習する（Paper）

実際の資金を動かす前に、**仮想資金 × ライブ価格**で売買を練習できます。Paper は public ticker のみを叩き、実際の口座やトレード API には一切触れません。API キーも不要です。

```bash
bitbank paper init --jpy=1000000                                                   # 仮想口座を初期化
bitbank paper create-order --pair=btc_jpy --side=buy --type=market --amount=0.001  # 成行で買い
bitbank paper assets                                                               # 仮想残高
bitbank paper pnl                                                                  # 損益サマリ
```

## 次のステップ

* 口座情報の取得や実際の取引を行うには → [API キーの設定](api-keys.md)
* CLI の呼び出し方や出力の扱いを深く知るには → [基本的な使い方](../guides/usage.md)
* 全コマンドを一覧で見るには → [コマンド一覧](../guides/commands.md)
* 取引の安全ガードを理解するには → [取引と安全ガード](../guides/trading.md)
