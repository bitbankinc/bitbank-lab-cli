# bitbank CLI & Agent Skills

bitbank 暗号資産取引所の CLI と Agent Skills スターターキット。

## ⚠️ 免責事項

本 CLI ツールが提供するデータを AI エージェントが受け取り処理した結果は、必ずしも正確性・完全性を保証するものではありません。

提供される情報は情報提供のみを目的としており、投資助言・代理業に該当するものではありません。投資に関する判断はご自身の責任で行ってください。

## 設計思想

CLI は bitbank API への**薄いアクセス層**。分析ロジックは一切持たせていません。  
Skills を編集・追加する等、ご自身の用途に合わせてカスタマイズしてください。

- **MCP サーバー** ([bitbank-genesis-mcp-server](https://github.com/tjackiet/bitbank-genesis-mcp-server)) はサーバー側で計算済みの結論を LLM に渡す
- **この CLI** は生データを高速に取得し、LLM 自身に計算させる

同じ bitbank API に対して、真逆のアプローチを提供します。モデルに生 OHLCV を渡せば、指標のパラメータもロジックも完全にカスタマイズ可能。MCP の固定実装では対応できない「自分だけの指標」が作れます。

## 主な提供物

このリポジトリは **CLI** と **Agent Skills** の 2 層構成です。

### 1. bitbank CLI（薄い API アクセス層）

bitbank API を叩く薄い CLI。以下のカテゴリを提供します。

- **Public** — マーケットデータ（認証不要）
- **Private** — アカウント情報の読み取り（要認証）
- **Trade** — 資金操作（ドライランデフォルト）
- **Paper** — ペーパートレード（仮想資金 × ライブ価格）
- **Profile** — API キー切替プロファイル管理
- **WebSocket** — リアルタイム配信（`stream` / `watch`）

```bash
bitbank ticker btc_jpy
bitbank candles btc_jpy --type=1day --format=table
bitbank paper create-order --pair=btc_jpy --side=buy --type=market --amount=0.001
```

詳細は [コマンド一覧](#コマンド一覧) を参照。

### 2. Agent Skills（Claude Code / Cursor 用）

自然言語で CLI を操作するための Skill を同梱。リポジトリを Claude Code / Cursor で開けば自動でトリガーされます。

```text
「BTC の RSI を見て」              → indicator-analysis
「ポートフォリオの状況を見せて」     → portfolio
「BTC を仮想で 0.01 買って」        → paper-trade
「買う前にざっと見て」              → recipe-pre-trade-check
```

カテゴリは分析系・取引系（paper-trade）・ユーティリティ・Recipe。詳細は [Agent Skills](#agent-skills) を参照。

## 想定する使い方

**Claude Code などのエージェント環境から自然言語で操作する**のが基本スタイルです。

- **Claude Code / Cursor（推奨）** — リポジトリを開くだけで Skill が動く（Cursor も `.claude/skills/` を互換で読むため追加設定不要）
- **Codex CLI / Gemini CLI など** — 各エージェント固有のパスに Skill をコピーすれば自動トリガー可能（[後述](#codex-cli--gemini-cli-で使う)）。配置しない場合も `AGENTS.md` 経由で CLI を呼ばせられる
- **ターミナル** — 動作確認やスクリプト連携、cron との接続など

Skills は利用者が自由に追加・編集していく前提なので、リポジトリごと手元に置きます。

## クイックスタート

クローン後、`./install.sh` を一度叩くだけで `bitbank` コマンドがどのディレクトリからでも使えるようになります（内部で `npm ci` と `npm link` を実行）。Node.js 20 以上が必要です。Linux / macOS 対応。

```bash
git clone https://github.com/tjackiet/bitbank-cli-skills.git
cd bitbank-cli-skills
./install.sh

# 動作確認
bitbank ticker btc_jpy
bitbank candles btc_jpy --type=1day --format=table
```

アンインストールは `npm unlink -g bitbank` です。

`install.sh` を使わず手元で都度実行する場合は、以下のフォールバック手順でも同じことができます。**以降の README 内コマンド例はすべて `./install.sh` 実行済みを前提に `bitbank <cmd>` 形式で記載しています**。フォールバック環境では `bitbank` を `npx tsx cli/index.ts` に、Private API は `npx tsx --env-file=.env cli/index.ts` に読み替えてください。

```bash
npm ci
npx tsx cli/index.ts ticker btc_jpy
# Private API（.env を tsx に直接読ませる）
npx tsx --env-file=.env cli/index.ts assets
```

## セットアップ

### 1. クローンとインストール

```bash
git clone https://github.com/tjackiet/bitbank-cli-skills.git
cd bitbank-cli-skills
./install.sh   # もしくは npm ci のみ
```

### 2. API キーを設定する（Private API / Trade 用）

Public API（ticker / candles 等）だけ使うなら不要です。

#### 推奨: `bitbank profile add` でプロファイル登録

```bash
bitbank profile add main
# API key を貼り付け（または BITBANK_API_KEY env から自動採用）
# API secret は対話で hidden 入力（画面に出ない）
```

`profiles.json` は `$XDG_CONFIG_HOME/bitbank/profiles.json`（未設定時は `~/.bitbank/profiles.json`）に **0600** で保存されます。

```bash
bitbank profile list                  # 登録済みプロファイル一覧（secret は出ない）
bitbank profile show main             # 詳細（secret は **** マスク）
bitbank profile set-default main      # default を切り替え
bitbank --profile=sub assets          # サブ口座で実行
bitbank profile remove sub --confirm  # 削除（--confirm 必須）

# secret は flag では受けません（shell 履歴に残るため）。env か対話プロンプトのみ
```

複数アカウント（メイン / サブ / read-only 検証用 等）を `bitbank --profile=<name> <cmd>` で切り替えられます。`--profile` 未指定時は `BITBANK_PROFILE` env → default profile → legacy env vars の順で解決します。

#### 後方互換: 既存の `.env` 慣用句

```bash
cp .env.example .env
# .env を編集して BITBANK_API_KEY / BITBANK_API_SECRET を設定
set -a; source .env; set +a
bitbank assets
```

profile を 1 つも登録していない環境では、従来通り `BITBANK_API_KEY` / `BITBANK_API_SECRET` env vars が読まれます。

> `.env` は `.gitignore` 済み。`profiles.json` はリポジトリ外（`~/.bitbank/`）に保存されます。いずれの形式でも API キーは絶対にコミットしないでください。

## 使い方

### Claude Code / Cursor で使う（推奨）

Claude Code でこのリポジトリを開くと、Agent Skills が自動で有効になります。Cursor も互換で `.claude/skills/` を読むため、追加設定なしで同じように動きます。自然言語でリクエストすれば、Skill が必要な CLI コマンドを組み立てて実行します。

```text
「BTC の RSI を見て」
「ポートフォリオの状況を見せて」
「SMA クロス戦略をバックテストして」
```

搭載している Skill 一覧は [Agent Skills](#agent-skills) を参照してください。

### Codex CLI / Gemini CLI で使う

Codex CLI / Gemini CLI など、`.claude/skills/` を読まないエージェントで Skill を自動トリガーさせたい場合は、各エージェントが見るパスにコピーまたはシンボリックリンクを張ります。

| エージェント | 配置先 |
|---|---|
| Codex CLI | `.agents/skills/<name>/SKILL.md` |
| Gemini CLI | `.gemini/skills/<name>/SKILL.md` または `.agents/skills/<name>/SKILL.md` |
| GitHub Copilot (VS Code) | VS Code 設定で指定 |

Skill を配置しない場合でも、ルートの `AGENTS.md` を読ませれば CLI 自体は呼び出せます。

> `.agents/skills/` を複数エージェント共通のパスとして整備する動きがありますが、現時点では各エージェント固有のパス配置が必要です。

### ターミナルから直接使う（動作確認・スクリプト連携）

エージェントを介さず CLI を直接叩けます。インストール直後の動作確認や、シェルスクリプト・cron との連携に使います。Private API は事前に `set -a; source .env; set +a` で env を export しておくか、profile を登録しておく必要があります（[セットアップ](#セットアップ) 参照）。

```bash
# Public API（認証不要）
bitbank ticker btc_jpy
bitbank candles btc_jpy --type=1day --format=table

# Private API（要 profile or env）
bitbank assets
bitbank active-orders --pair=btc_jpy
```

利用可能なコマンドは次の [コマンド一覧](#コマンド一覧) を参照してください。

## コマンド一覧

### Public（認証不要）

| コマンド | 説明 | 使用例 |
|---------|------|--------|
| `ticker` | 単一ペアのティッカー | `bitbank ticker btc_jpy` |
| `tickers` | 全ペア一括ティッカー | `bitbank tickers` |
| `tickers-jpy` | 全JPYペア一括 | `bitbank tickers-jpy` |
| `depth` | 板情報（asks/bids） | `bitbank depth btc_jpy` |
| `transactions` | 約定履歴 | `bitbank transactions btc_jpy` |
| `candles` | ローソク足 OHLCV | `bitbank candles btc_jpy --type=1day` |
| `circuit-break` | サーキットブレーカー | `bitbank circuit-break btc_jpy` |
| `status` | 取引所ステータス | `bitbank status` |
| `pairs` | ペア設定情報 | `bitbank pairs` |

### Private（要認証）

| コマンド | 説明 | 使用例 |
|---------|------|--------|
| `assets` | 保有資産一覧 | `assets --format=table` |
| `order` | 注文情報照会 | `order --pair=btc_jpy --order-id=123` |
| `orders-info` | 複数注文照会 | `orders-info --pair=btc_jpy --order-ids=1,2,3` |
| `active-orders` | アクティブ注文 | `active-orders --pair=btc_jpy` |
| `trade-history` | 約定履歴 | `trade-history --pair=btc_jpy` |
| `deposit-history` | 入金履歴 | `deposit-history --asset=btc` |
| `unconfirmed-deposits` | 未確認入金 | `unconfirmed-deposits` |
| `deposit-originators` | 入金元情報 | `deposit-originators --asset=btc` |
| `withdrawal-accounts` | 出金先一覧 | `withdrawal-accounts --asset=btc` |
| `withdrawal-history` | 出金履歴 | `withdrawal-history --asset=btc` |
| `margin-status` | 証拠金ステータス | `margin-status` |
| `margin-positions` | ポジション情報 | `margin-positions --pair=btc_jpy` |

### Trade（資金操作 — ドライランデフォルト）

Trade コマンドは `bitbank trade <subcommand>` の形で呼び出します（誤爆防止のため public/private とは階層を分けています）。

| コマンド | 説明 | 使用例 |
|---------|------|--------|
| `trade create-order` | 新規注文 | `trade create-order --pair=btc_jpy --side=buy --type=limit --price=9000000 --amount=0.001` |
| `trade cancel-order` | 注文キャンセル | `trade cancel-order --pair=btc_jpy --order-id=123` |
| `trade cancel-orders` | 一括キャンセル | `trade cancel-orders --pair=btc_jpy --order-ids=1,2,3` |
| `trade confirm-deposits` | 入金確認 | `trade confirm-deposits --id=456` |
| `trade confirm-deposits-all` | 全入金確認 | `trade confirm-deposits-all` |
| `trade withdraw` | 出金リクエスト | `trade withdraw --asset=btc --uuid=xxx --amount=0.1 --execute --confirm` |

> Trade コマンドは `--execute` を付けない限り API を叩きません（ドライラン）。`withdraw` は追加で `--confirm` も必須です。サブコマンド一覧は `bitbank trade` で表示できます。
>
> Trade コマンド（POST）はネットワーク例外・タイムアウト・5xx でも自動再送しません（二重実行防止）。失敗が返った場合は再実行する前に `active-orders` / `trade-history` / `assets` で実際の状態を確認してください。

### Paper（ペーパートレード — 仮想資金）

`bitbank paper <subcommand>` でライブ価格 × 仮想資金のシミュレーションを行います。実 API は public ticker のみ叩き、private / trade エンドポイントには一切触れません。状態は `~/.bitbank/paper-state.json`（または `$XDG_DATA_HOME/bitbank/paper-state.json`）に保存されます。

| コマンド | 説明 | 使用例 |
|---------|------|--------|
| `paper init` | 仮想口座を初期化 | `paper init --jpy=1000000` |
| `paper assets` | 仮想残高を表示（`available` / `locked` / `total`） | `paper assets` |
| `paper create-order` (market) | 成行で即時 fill（last 価格） | `paper create-order --pair=btc_jpy --side=buy --type=market --amount=0.001` |
| `paper create-order` (limit) | 指値を `openOrders` に積む（残高ロック） | `paper create-order --pair=btc_jpy --side=buy --type=limit --price=10000000 --amount=0.001` |
| `paper active-orders` | 未約定の指値一覧 | `paper active-orders` |
| `paper cancel-order` | 指値を ID 指定でキャンセル（ロック解除） | `paper cancel-order --id=<id>` |
| `paper tick` | 直前 tick 以降の 1m 足で指値 fill を解決 | `paper tick` |
| `paper trade-history` | 仮想約定履歴 | `paper trade-history` |
| `paper pnl` | 損益サマリ（realized + unrealized、ペア別 + 合計） | `paper pnl --pair=btc_jpy` |
| `paper reset` | 仮想口座をリセット（`--confirm` 必須） | `paper reset --confirm` |

> 指値は GTC のみ（部分約定なし）。fill 判定は前回 tick 以降の 1m 足を時系列で走査し、`buy: candle.low <= price` / `sell: candle.high >= price` で全量約定します。約定価格は指値ぴったり（スリッページなし）。`paper assets` / `paper trade-history` / `paper active-orders` / `paper create-order` を呼ぶと裏で lazy tick が走り、未解決の fill を解消してから結果を返します。明示的に解決したい場合は `paper tick` を直接実行してください。`lastTickAt` から 24h 以上空くと対象期間を直近 24h に制限し、stderr に警告を出します。
>
> 指値発注時は `price * amount + fee` 相当を JPY（買い）または `amount` を base 通貨（売り）で「ロック扱い」にします。`paper assets` の `available` は `total - locked` で、`available` 不足の指値発注は Err になります。手数料は bitbank 公称テイカー手数料（0.12%）。スリッページは入っていません。

### Stream（リアルタイム）

```bash
# Public: ティッカー・約定・板のリアルタイム配信
bitbank stream btc_jpy

# チャンネル指定
bitbank stream btc_jpy --channel=transactions

# Private: ユーザーデータのリアルタイム配信（要 profile or env）
bitbank stream --private --pair=btc_jpy
```

### ライブ価格 watch（WebSocket ticker）

`bitbank watch ticker <pair>` は ticker チャネルを 1 行 JSONL で配信する
専用コマンド。pipe しやすく、停止条件・自動再接続・無音検出を備える。

```bash
# 5 秒間 ticker を JSONL で取得（json は pipe 向け）
bitbank watch ticker btc_jpy --duration=5 --format=json

# TTY なら既定で table（ANSI で 1 行を再描画）
bitbank watch ticker btc_jpy

# 10 件取得して終了
bitbank watch ticker btc_jpy --count=10 --format=json

# jq で last だけを抽出
bitbank watch ticker btc_jpy --duration=10 --format=json | jq -r '.last'
```

- 終了条件: `--duration=<秒>` / `--count=<n>` / SIGINT
- 切断時は指数バックオフで自動再接続（1, 2, 4, 8, 16, 32, 32...）。
  上限は `--max-retries=<n>`、上限到達時は `EXIT.NETWORK`（exit code 5）
- 無音検出は `--idle-timeout=<秒>`（既定 30）で発火し再接続フローへ
- depth / transactions など他チャネルは MVP 対象外（`bitbank stream` を使う）

Exit code は `cli/exit-codes.ts` の `EXIT` 定数で定義: `SUCCESS`(0) /
`GENERAL`(1) / `AUTH`(2) / `RATE_LIMIT`(3) / `PARAM`(4) / `NETWORK`(5)。

## 出力フォーマット

全コマンドで `--format` オプションが使えます:

```bash
bitbank ticker btc_jpy --format=json   # デフォルト
bitbank ticker btc_jpy --format=table  # 見やすいテーブル
bitbank ticker btc_jpy --format=csv    # パイプ・インポート向け
```

```bash
# jq でフィルタ
bitbank ticker btc_jpy | jq '.last'

# CSV をファイルに保存
bitbank candles btc_jpy --type=1day --format=csv > btc_daily.csv
```

## Shell 補完

`bitbank completion <shell>` で補完スクリプトを stdout に出力します。
コマンド名・`trade` / `paper` のサブコマンド・`pair` 引数（`btc_jpy` など）・
`--format=` の値・既知のフラグを補完します。

### bash

```bash
# 一度試す
source <(bitbank completion bash)

# 永続化（~/.bashrc.d がある環境）
bitbank completion bash >> ~/.bashrc.d/bitbank-completion.sh

# それ以外は ~/.bashrc に追記
echo 'source <(bitbank completion bash)' >> ~/.bashrc
```

### zsh

```bash
# fpath にあるディレクトリへ _bitbank として配置
bitbank completion zsh > "${fpath[1]}/_bitbank"

# 反映
autoload -U compinit && compinit
```

補完スクリプトはコマンド一覧・ペア一覧を生成時に埋め込みます。
補完経路で `bitbank` 本体を起動しないため、シェル起動・タブ補完が遅くなりません。
新コマンドや新ペアを追加した後はスクリプトを再生成してください。

## Agent Skills

Claude Code / Cursor でリポジトリを開くと自動的にトリガーされる Skill を 12 本搭載しています（Cursor は `.claude/skills/` を互換で読みます）。Skill はモデルへの指示書であり、CLI コマンドを組み合わせて分析や取引を実行します。
あくまでサンプルですので、ご自身の用途に合わせて追加・編集してください。Codex CLI / Gemini CLI など他エージェントでの配置先は [使い方](#codex-cli--gemini-cli-で使う) を参照してください。

共通の参照資料（`bitbank-api-formats.md` 等）は `.claude/skills/_shared/references/` に集約しており、各 Skill から参照されます。

> Skill の使い所はこちら → [Skill 使い所ガイド](docs/skill-workflow.md)

### 分析系（7本）

#### portfolio

保有資産のポートフォリオ分析。資産構成・JPY 建て評価額・推移。

```
「ポートフォリオの状況を見せて」
「資産推移を見たい」
「保有資産の比率を確認して」
```

#### volatility-profile

リターン分布の歪度・尖度・ファットテール倍率、時間帯別出来高、√T スケーリングなどリスク特性を定量化。

```
「BTC のボラどう？」
「ファットテール度は？」
「ストップ幅どう決める？」
```

#### correlation-analysis

複数銘柄間の関係性を定量化。Pearson / Spearman 相関、β 行列、ローリング相関、環境別（上昇 / 下落）相関、ラグ相関。

```
「BTC-ETH の相関は？」
「分散投資効果はある？」
「ETH の β は？」
```

#### data-verification

ローソク足データの品質検証。欠損足の検出、OHLCV 整合性、異常値、重複検出。

```
「データ検証して」
「欠損ないか確認して」
「品質チェックして」
```

#### indicator-analysis

テクニカル指標を計算・分析。SMA、RSI、MACD、ボリンジャーバンド、ATR、ROC 等。

```
「BTC の RSI を見て」
「移動平均のクロスを確認して」
「ETH の4時間足でテクニカル分析して」
```

#### signal-explorer

シグナル候補の予測力を評価。生データ vs 将来リターン相関、Z-score 改善度、ラグ相関、自己相関、既存指標との冗長性、符号ベース簡易 PnL。

```
「RSI、本当に効く？」
「この指標に予測力ある？」
「自作のシグナルを評価して」
```

#### backtest

トレーディング戦略のバックテスト。SMA クロス、RSI 逆張り等を過去データでシミュレーション。

```
「SMA クロス戦略をバックテストして」
「過去1年の BTC で RSI 逆張りの成績は？」
「複数の戦略を比較して」
```

### 取引系（1本）

#### paper-trade

仮想資金でのペーパートレード。ライブ価格 × ローカル state で売買を練習・検証する。実 API は public ticker のみ叩き、private/trade エンドポイントには一切触れない。

```
「BTC を仮想で 0.01 買って」
「ペーパー口座の残高見て」
「指値で BTC を 1000 万円で買い注文」
```

### ユーティリティ（2本）

#### profile-management

API キー切替プロファイル（`profiles.json`）の管理。メイン口座 / サブ口座 / read-only 検証用などをユースケースごとに切り替える。

```
「API キー追加して」
「サブ口座のキー登録」
「default profile 切り替えて」
```

#### watch-live

bitbank の WebSocket public stream で ticker をリアルタイム購読。1 行 JSONL または ANSI 再描画 table で配信し、`jq` で加工しやすい。

```
「BTC の ticker をライブで見たい」
「ライブで last を 10 秒だけ見たい」
「リアルタイム価格監視」
```

### Recipe（2本）

複数の skill を順に呼び出して一連のワークフローにまとめる recipe 系。最終判断は人間が下す前提で、各 skill の出力を束ねた「チェックリスト」として使う。

#### recipe-pre-trade-check

ある銘柄を「買う前に最低限これだけは見る」を一気通貫で実行。保有資産・ボラ環境・データ健全性・テクニカル指標を順に確認し、総合判断（GO / WAIT / NO-GO）を提示。

```
「BTC 買いたいけど、買う前に何見ればいい？」
「pre-trade check して」
「ETH エントリーしていい？」
```

#### recipe-portfolio-review

保有ポートフォリオの「総点検」を一気通貫で実行。資産構成・銘柄間相関・各保有銘柄のボラ環境を順に確認し、総合判断（健全 / 注意 / 要見直し）を提示。

```
「ポートフォリオを見直したい」
「分散効いてる？」
「リバランス必要？」
```

### 独自 Skill の追加

`.claude/skills/<name>/SKILL.md` を作成するだけで独自 Skill を追加できます。詳細は [カスタマイズガイド](docs/customization-guide.md) を参照してください。

## 謝辞

いくつかの Skill は hoheto 氏の学習教材 [crypto-data-analysis-course](https://github.com/i-love-profit/crypto-data-analysis-course) を参考にして作成しました。素晴らしい教材を公開してくださっていることに感謝いたします。

各 Skill と教材の対応は以下のとおりです。Skill をより深く理解したい / 自分で発展させたい方は、対応する Vol を読むのがおすすめです。

| Skill | 参考にした Vol |
|-------|----------------|
| `data-verification` | [Vol.01 データ取得とクレンジング](https://github.com/i-love-profit/crypto-data-analysis-course/blob/main/vol01_data_acquisition_and_cleansing.ipynb) |
| `volatility-profile` | [Vol.02 リターン分布と出来高分布](https://github.com/i-love-profit/crypto-data-analysis-course/blob/main/vol02_return_and_volume_distribution.ipynb) |
| `correlation-analysis` | [Vol.03 相関分析](https://github.com/i-love-profit/crypto-data-analysis-course/blob/main/vol03_correlation_analysis.ipynb) / [Vol.04 リードラグ分析](https://github.com/i-love-profit/crypto-data-analysis-course/blob/main/vol04_lead_lag_analysis.ipynb)（ラグ・安定性） |
| `indicator-analysis` | [Vol.05 テクニカル指標の作成と評価](https://github.com/i-love-profit/crypto-data-analysis-course/blob/main/vol05_technical_indicators.ipynb)（前半） |
| `signal-explorer` | [Vol.05 テクニカル指標の作成と評価](https://github.com/i-love-profit/crypto-data-analysis-course/blob/main/vol05_technical_indicators.ipynb)（後半） / [Vol.06 指標の探索](https://github.com/i-love-profit/crypto-data-analysis-course/blob/main/vol06_indicator_exploration.ipynb) / [Vol.04 リードラグ分析](https://github.com/i-love-profit/crypto-data-analysis-course/blob/main/vol04_lead_lag_analysis.ipynb)（リーク検証手法） |
| `backtest` | [Vol.04 リードラグ分析](https://github.com/i-love-profit/crypto-data-analysis-course/blob/main/vol04_lead_lag_analysis.ipynb)（リーク・コスト感度） + 教材横断のリスク指標 |

## フィードバック

バグ報告・機能リクエストは [GitHub Issues](https://github.com/tjackiet/bitbank-cli-skills/issues) へお願いします。

## 開発

```bash
npm test          # テスト実行（E2E はスキップ）
npm run lint      # Biome lint
npm run typecheck # 型チェック
```

`npm test` では実 API を叩く E2E ブロックは `TEST_E2E=1` で gating されており、デフォルトでは skip される。実 API に対する E2E を走らせる場合は `TEST_E2E=1 npm test` を指定する（`.env.example` の API キー設定が必要）。

### コントリビューター向けセットアップ

このリポジトリ自体に PR を送る場合は、Claude Code 用の hook をローカルで
有効化してください:

    ./.dev/setup.sh

これで lint / test / 設定保護の hook が `.claude/` 配下に symlink で
復元されます。`.claude/settings.json` と `.claude/hooks/` は `.gitignore`
済みなのでコミットには含まれません。詳細は `.dev/README.md` を参照。

### アーキテクチャ

```
cli/
  index.ts              # サブコマンドルーター
  output.ts             # json/table/csv フォーマッター
  types.ts              # Result<T> 型定義
  http.ts               # Public API クライアント
  http-private.ts       # Private GET（HMAC 認証）
  http-private-post.ts  # Private POST（HMAC 認証）
  auth.ts               # HMAC-SHA256 署名
  commands/
    public/             # 認証不要コマンド（9）
    private/            # 認証必要・読み取り専用（13）
    trade/              # 資金操作・ドライランデフォルト（6）
    paper/              # ペーパートレード（ライブ価格 × ローカル state、5）
    stream.ts           # リアルタイムストリーム
  __tests__/            # 全コマンドのテスト（37ファイル / 140テスト）
.claude/skills/         # Agent Skills（12本 + _shared/references/）
docs/                   # ADR・フェーズ管理・カスタマイズガイド
```
