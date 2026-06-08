---
description: bitbank CLI の使い方の全体像。エージェント経由・ターミナル直叩きの 2 つのスタイル、コマンドの構造、出力フォーマット、シェル補完を説明します。
---

# 基本的な使い方

bitbank CLI は 2 つのスタイルで使えます。普段は **AI エージェントから自然言語で操作**し、動作確認やスクリプト連携では **ターミナルから直接叩く**、という使い分けが基本です。

## 使い方の 3 スタイル

{% tabs %}
{% tab title="Claude Code / Cursor（推奨）" %}

リポジトリを開くだけで Agent Skills が自動で有効になります（Cursor も `.claude/skills/` を互換で読むため追加設定は不要）。自然言語でリクエストすると、Skill が必要な CLI コマンドを組み立てて実行します。

```text
「BTC の RSI を見て」
「ポートフォリオの状況を見せて」
「SMA クロス戦略をバックテストして」
```

搭載 Skill は [Agent Skills](skills.md) を参照してください。

{% endtab %}

{% tab title="Codex CLI / Gemini CLI など" %}

`.claude/skills/` を読まないエージェントで Skill を自動トリガーさせたい場合は、各エージェントが見るパスに Skill をコピー（またはシンボリックリンク）します。配置しない場合でも、ルートの `AGENTS.md` を読ませれば CLI 自体は呼び出せます。

| エージェント | 配置先 |
|---|---|
| Codex CLI | `.agents/skills/<name>/SKILL.md` |
| Gemini CLI | `.gemini/skills/<name>/SKILL.md` または `.agents/skills/<name>/SKILL.md` |

{% endtab %}

{% tab title="ターミナル直叩き" %}

エージェントを介さず CLI を直接実行できます。動作確認や、シェルスクリプト・cron との連携に向いています。

```bash
# Public API（認証不要）
bitbank ticker btc_jpy
bitbank candles btc_jpy --type=1day --format=table

# Private API（要 profile or env）
bitbank assets
bitbank active-orders --pair=btc_jpy
```

{% endtab %}
{% endtabs %}

## コマンドの構造

コマンドは大きく分けて、フラットに呼ぶものと、サブコマンド形式のものがあります。

```text
bitbank <command> [args] [--flags]          # public / private
bitbank trade   <subcommand> [--flags]       # 資金操作（ドライランがデフォルト）
bitbank paper   <subcommand> [--flags]       # 仮想資金での練習
bitbank profile <subcommand> [--flags]       # API キー切替プロファイル
```

`trade` / `paper` / `profile` をサブコマンド形式にしているのは、フラットな一覧での誤爆を減らし、操作対象を視覚的に区別するためです。全コマンドは [コマンド一覧](commands.md) を参照してください。

## 出力フォーマット

すべての取得系コマンドで `--format` が使えます。デフォルトは `json` です。

| フォーマット | 用途 |
|---|---|
| `json`（デフォルト） | プログラム処理・`jq` でのフィルタ |
| `table` | 人が読みやすい整形テーブル |
| `csv` | パイプ・表計算ソフトへのインポート |

```bash
bitbank ticker btc_jpy | jq '.last'                       # last だけ抽出
bitbank candles btc_jpy --type=1day --format=csv > out.csv # CSV 保存
```

### `--machine`（プログラム・Skill 経由の利用）

スクリプトや Agent Skill から読む場合は `--format=json --machine` を併用します。`--machine` を付けると `{ success, data, partial?, meta? }` の envelope が 1 行で出力され、candles の `meta.lastIsIncomplete`（末尾足が未確定か）/ `gaps`（欠損）/ `dedupedCount` / `truncated` といったデータ完全性のメタが取れます。

```bash
bitbank candles btc_jpy --type=1day --format=json --machine
# → {"success":true,"data":{...},"meta":{"lastIsIncomplete":true,...}}
```

{% hint style="info" %}
`--machine` を付けないコマンドもあります。`watch` / `stream`（JSONL ストリーム）、`completion`（補完出力）、`profile add`（対話入力）は envelope の概念がないため対象外です。
{% endhint %}

## シェル補完

`bitbank completion <shell>` で補完スクリプトを出力できます。コマンド名・サブコマンド・ペア引数・`--format=` の値・既知のフラグを補完します。

{% tabs %}
{% tab title="bash" %}

```bash
# 一度だけ試す
source <(bitbank completion bash)

# 永続化（~/.bashrc に追記）
echo 'source <(bitbank completion bash)' >> ~/.bashrc
```

{% endtab %}

{% tab title="zsh" %}

```bash
# fpath にあるディレクトリへ _bitbank として配置
bitbank completion zsh > "${fpath[1]}/_bitbank"

# 反映
autoload -U compinit && compinit
```

{% endtab %}
{% endtabs %}

補完スクリプトはコマンド・ペアの一覧を生成時に埋め込むため、タブ補完のたびに `bitbank` 本体を起動しません。新コマンドや新ペアを追加したら、スクリプトを再生成してください。

## stderr の扱い

CLI は警告（キャッシュ書き込み失敗・リトライ通知など）を stderr に出します。`2>/dev/null` で握りつぶさず、stdout の JSON だけをパースして stderr は観察用に流すのがおすすめです。
