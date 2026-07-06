# bitbank CLI

[![CI](https://github.com/bitbankinc/bitbank-lab-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/bitbankinc/bitbank-lab-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/bitbank-lab-cli.svg)](https://www.npmjs.com/package/bitbank-lab-cli)
[![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/bitbankinc/bitbank-lab-cli?utm_source=oss&utm_medium=github&utm_campaign=bitbankinc%2Fbitbank-lab-cli&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)](https://coderabbit.ai)

暗号資産取引所 bitbank の CLI。

## はじめにお読みください

- 本ツールは**開発段階（ベータ版）**です。利用は**自己責任**でお願いします。
- ご利用の前に必ず [⚠️ 免責事項](#免責事項) をお読みください。
- 本リポジトリは **bitbank バグバウンティプログラムの対象範囲外** です。

## 前提条件

- **Node.js 22 以上**（[公式サイト](https://nodejs.org/) からインストール。`node -v` で確認できます）
- npm（Node.js に同梱されています）
- 対応 OS: macOS / Linux / Windows（WSL 含む）
- **macOS で git を使う導線のみ**: Xcode Command Line Tools が必要です（clone や plugin add が内部で git を使います。未導入なら `xcode-select --install`）

> 本プロジェクトは npm に [`bitbank-lab-cli`](https://www.npmjs.com/package/bitbank-lab-cli) として公開済みです。通常利用ではソースのクローンは不要です（開発したい方向けの手順は [開発](#開発) を参照）。

## 目的別ガイド

初見の方は、目的に近い導線から読み進めてください。

- **使うだけ**（コマンドを叩いて市況を取りたい）→ [クイックスタート](#クイックスタート) / [コマンド一覧](#コマンド一覧)
- **Skill を育てる**（自然言語で操作・カスタマイズしたい）→ [Agent Skills](#agent-skills) / [カスタマイズガイド](docs/customization-guide.md)
- **CLI を開発する**（コマンド追加・コントリビュート）→ [開発](#開発) / [アーキテクチャ](#アーキテクチャ) / [`.claude/rules/commands.md`](.claude/rules/commands.md)
- **paper で bot 検証**（仮想資金で戦略を試したい）→ [Paper](#paperペーパートレード--仮想資金) / [botter 運用 Runbook](docs/botter-runbook.md)

## 設計思想

CLI は bitbank API への**薄いアクセス層**。分析ロジックは一切持たせていません。  
Skills を編集・追加する等、ご自身の用途に合わせてカスタマイズしてください。

- **MCP サーバー** ([bitbank-lab-mcp](https://github.com/bitbankinc/bitbank-lab-mcp)) はサーバー側で計算済みの結論を LLM に渡す
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

## Plugin としてインストールする

Plugin が登録するのは **Skills（モデルへの指示書）だけ**で、実処理を担う CLI 本体は含まれません。**どの導線でも `npm i -g bitbank-lab-cli` が別途必須**です（[前提条件](#前提条件) 参照。plugin cache 同梱の `bin/bitbank` は依存を含まず直接実行できません）。

Plugin 登録が必要なのは「**リポジトリを開いていない場所でも Skill を使いたい**」場合だけです。Claude Code / Cursor でこのリポジトリを clone して開く使い方なら、Skill は自動で有効になるため登録不要です（[想定する使い方](#想定する使い方) 参照）。

> 注: `/plugin install` はローカル版 Claude Code CLI（ターミナル）用の slash command です。Web 版（[claude.ai/code](https://claude.ai/code)）はコンテナが一時的で `bitbank` CLI を PATH へ永続化できないため動作しません。

### Claude Code

slash command は **1 行ずつ送信**してください（一気に貼り付けると 1 つのコマンドとして解釈されて失敗します）。

1. マーケットプレイスを登録:

   ```
   /plugin marketplace add bitbankinc/bitbank-lab-cli
   ```

2. plugin をインストール:

   ```
   /plugin install bitbank-lab-cli@bitbank-lab-cli
   ```

3. インストール直後は、今開いている Claude Code に skill がまだ読み込まれていません。`/reload-plugins` を実行するか、Claude Code を再起動してください（次回以降の起動では自動ロードされるため、この操作は初回のみです）。

### Cursor

導入経路は 2 つあります。

**A. リポジトリを開くだけ（plugin 不要）** — Cursor は `.claude/skills/` を互換で読むため、このリポジトリを clone して開けば Skill がそのまま有効になります（[想定する使い方](#想定する使い方) 参照）。

**B. Plugin として登録（リポジトリを開いていない場所でも使う）** — Cursor の Plugins（Customize）画面で「Search or Paste Link」に GitHub URL を貼って Import します:

```
https://github.com/bitbankinc/bitbank-lab-cli
```

Import すると `.cursor-plugin/plugin.json` が読まれ、`skills/` 配下の Skill 一式が user scope（全プロジェクト共通）で登録されます。

> **Claude Code と plugin の状態を共有します**（実機確認ベース）: Cursor は plugin の実体・登録情報を Claude Code と同じ `~/.claude/plugins/` 配下（`cache/` / `installed_plugins.json` 等）で管理します。そのため **Claude Code 側で `/plugin install` 済みだと、Cursor では追加操作なしで有効になっている**ことがあります（Plugins 一覧に `Imported` と表示）。
>
> **更新は自動ではありません**: plugin はバージョン固定キャッシュ（git commit 固定）で保存されるため、リポジトリ側が更新されても自動では追従しません。新しい Skill を取り込むには Plugins 画面から update または再 import してください。

### Codex CLI

導入は「marketplace 追加 → plugin 名の確認 → add」の 3 ステップです（`codex plugin install <owner>/<repo>` というサブコマンドは存在しません）。

```bash
# 1. marketplace を追加
codex plugin marketplace add bitbankinc/bitbank-lab-cli

# 2. 登録された plugin 名を確認する（重要）
codex plugin list

# 3. list に表示された <plugin>@<marketplace> をそのまま指定して add
codex plugin add <plugin>@<marketplace>
```

- `<plugin>@<marketplace>` の名前は決め打ちせず、**`codex plugin list` に表示されたものをそのまま使ってください**（環境や manifest により変わります）。
- 実行中、Codex が `~/.codex` 配下への書き込みの承認プロンプトを出すことがあります。**Yes** で進めてください。
- **macOS**: 内部で `git clone` を実行するため Xcode Command Line Tools が必要です（[前提条件](#前提条件) 参照）。
- CLI 本体（`npm i -g bitbank-lab-cli`）は別途必要です（[前提条件](#前提条件) 参照）。

### Antigravity CLI（旧 Gemini CLI）

```bash
agy plugin install https://github.com/bitbankinc/bitbank-lab-cli
```

Plugin install で skills が登録され、`bitbank` CLI（`npm i -g bitbank-lab-cli` で別途インストール）と組み合わせて使えます。自動 install したくない場合は [Codex CLI / Antigravity CLI で使う](#codex-cli--antigravity-cli-で使う) の手動コピー手順も使えます。

> 旧 Gemini CLI は 2026-06-18 に個人向け提供が終了し、Antigravity CLI（`agy`）へ移行しました（旧環境からは `agy plugin import gemini` で移行可能）。本リポジトリは `plugin.json` と旧 `gemini-extension.json` を両置きしており、新旧どちらの CLI からも install できます。

> 注: 各エージェントの plugin install コマンドは仕様変更が多いため、動かない場合は公式ドキュメントを確認してください。

## 想定する使い方

**Claude Code などのエージェント環境から自然言語で操作する**のが基本スタイルです。

- **Claude Code / Cursor（推奨）** — リポジトリを開くだけで Skill が動く（Cursor も `.claude/skills/` を互換で読むため追加設定不要）
- **Codex CLI / Antigravity CLI など** — 各エージェント固有のパスに Skill をコピーすれば自動トリガー可能（[後述](#codex-cli--antigravity-cli-で使う)）。配置しない場合も `AGENTS.md` 経由で CLI を呼ばせられる
- **ターミナル** — 動作確認やスクリプト連携、cron との接続など

Skills は利用者が自由に追加・編集していく前提なので、リポジトリごと手元に置きます。

## クイックスタート

npm から `bitbank` コマンドをグローバルインストールするのがいちばん簡単です。環境要件は [前提条件](#前提条件) を参照（Node.js 22 以上）。

```bash
npm i -g bitbank-lab-cli

# 動作確認
bitbank ticker btc_jpy
bitbank candles btc_jpy --type=1day --format=table
```

試し叩きだけなら `npx -y bitbank-lab-cli ticker btc_jpy` で install なしに実行できます。アンインストールは `npm uninstall -g bitbank-lab-cli`。

skills を改造したい場合や開発に参加したい場合は、リポジトリをクローンして `./install.sh` を叩く手順も使えます（内部で `npm ci` と `npm link` を実行）。

```bash
git clone https://github.com/bitbankinc/bitbank-lab-cli.git
cd bitbank-lab-cli
./install.sh
```

`install.sh` を使わず手元で都度実行する場合は、以下のフォールバック手順でも同じことができます。**以降の README 内コマンド例はすべて `bitbank` コマンドが PATH に通っている前提で記載しています**。フォールバック環境では `bitbank` を `npx tsx cli/index.ts` に、Private API は `npx tsx --env-file=.env cli/index.ts` に読み替えてください。

```bash
npm ci
npx tsx cli/index.ts ticker btc_jpy
# Private API（.env を tsx に直接読ませる）
npx tsx --env-file=.env cli/index.ts assets
```

毎回 `npx tsx ...` を打つのが手間なら、`npm run` の短縮 alias も使えます（`--` 以降が CLI 引数）。

```bash
npm run cli -- ticker btc_jpy
# Private API（.env を読み込む版）
npm run cli:env -- assets
```

## セットアップ

### 1. インストール

[クイックスタート](#クイックスタート) を参照（CLI を使うだけなら `npm i -g bitbank-lab-cli`、skills を改造する場合はクローンして `./install.sh`）。

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

#### 推奨ポリシー（secret の取扱い）

24/7 で trade API を握る運用（botter 等）では、secret 漏洩のコストが片側に寄ります。最低限以下を守ってください。

- **`profiles.json` 経路を default に**: 0600 強制 / `process.env` 非汚染 / `BITBANK_*` 以外のキーは読み捨て。`.env` より意図的に狭く作っています
- **secret は CLI flag で渡さない**: shell 履歴・`ps` 出力に残るため、env か対話 hidden 入力のみ（`--api-secret=...` のような flag は実装していません）
- **trade 用と read-only 用を別 profile に分ける**: 監視には read-only キー、trade には trade キーを `--profile=<name>` で使い分けると、誤爆の被害が局所化できます
- **外部 secret manager を使う場合**: クラウド系（Vault / SaaS 各種）や OS keychain で secret を管理しているなら、ラッパで `BITBANK_API_KEY` / `BITBANK_API_SECRET` を env に注入してから `bitbank` を起動すれば動きます。CLI は env 経路を受けるだけで、特定ツールには依存しません
- **trade コマンドの安全ガード**: `--execute` / `--confirm` / 出金 allowlist の詳細は [`.claude/rules/trading-safety.md`](.claude/rules/trading-safety.md) を参照
- **脆弱性の報告**: 公開 Issue ではなく [`SECURITY.md`](SECURITY.md) の private vulnerability reporting フローを使ってください

## 使い方

### Claude Code / Cursor で使う（推奨）

Claude Code でこのリポジトリを開くと、Agent Skills が自動で有効になります。Cursor も互換で `.claude/skills/` を読むため、追加設定なしで同じように動きます。自然言語でリクエストすれば、Skill が必要な CLI コマンドを組み立てて実行します。

```text
「BTC の RSI を見て」
「ポートフォリオの状況を見せて」
「SMA クロス戦略をバックテストして」
```

搭載している Skill 一覧は [Agent Skills](#agent-skills) を参照してください。

### Codex CLI / Antigravity CLI で使う

Codex CLI / Antigravity CLI など、`.claude/skills/` を読まないエージェントで Skill を自動トリガーさせたい場合は、各エージェントが見るパスにコピーまたはシンボリックリンクを張ります。

| エージェント | 配置先 |
|---|---|
| Codex CLI | `.agents/skills/<name>/SKILL.md` |
| Antigravity CLI | `.agents/skills/<name>/SKILL.md`（旧 Gemini CLI の `.gemini/skills/` は読まれない） |
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
| `trade-history` | 約定履歴（`--all` で全件ページング） | `trade-history --pair=btc_jpy --all` |
| `deposit-history` | 入金履歴 | `deposit-history --asset=btc` |
| `unconfirmed-deposits` | 未確認入金 | `unconfirmed-deposits` |
| `deposit-originators` | 入金元情報 | `deposit-originators --asset=btc` |
| `withdrawal-accounts` | 出金先一覧 | `withdrawal-accounts --asset=btc` |
| `withdrawal-history` | 出金履歴 | `withdrawal-history --asset=btc` |
| `margin-status` | 証拠金ステータス | `margin-status` |
| `margin-positions` | ポジション情報 | `margin-positions --pair=btc_jpy` |

> `trade-history --all` / `trade-history-all` は自動でページングします。
> 既定の上限は `--max-pages=1000`（API 仕様変更などで無限化しないための
> 安全弁）。上限到達時は途中までのデータと共に `partial: true` /
> `meta.truncated: true` / `meta.reason: "MAX_PAGES"` を返します。
> 重複検出による停止ロジックは従来通り動作します。

### Trade（資金操作 — ドライランデフォルト）

Trade コマンドは `bitbank trade <subcommand>` の形で呼び出します（誤爆防止のため public/private とは階層を分けています）。

| コマンド | 説明 | 使用例 |
|---------|------|--------|
| `trade create-order` | 新規注文 | `trade create-order --pair=btc_jpy --side=buy --type=limit --price=9000000 --amount=0.001` |
| `trade cancel-order` | 注文キャンセル | `trade cancel-order --pair=btc_jpy --order-id=123` |
| `trade cancel-orders` | 一括キャンセル | `trade cancel-orders --pair=btc_jpy --order-ids=1,2,3` |
| `trade confirm-deposits` | 入金確認 | `trade confirm-deposits --id=456` |
| `trade confirm-deposits-all` | 全入金確認 | `trade confirm-deposits-all` |

> Trade コマンドは `--execute` を付けない限り API を叩きません（ドライラン）。さらに `--execute` 単独でも POST には到達せず、コマンドごとの固定フレーズを `--confirm=<phrase>` で渡す**二段確認**が必須です（例: `--confirm=I-UNDERSTAND-CREATE-ORDER`）。フレーズ一覧は [`.claude/rules/trading-safety.md`](.claude/rules/trading-safety.md) を参照してください。サブコマンド一覧は `bitbank trade` で表示できます。
>
> Trade コマンド（POST）はネットワーク例外・タイムアウト・5xx でも自動再送しません（二重実行防止）。失敗が返った場合は再実行する前に `active-orders` / `trade-history` / `assets` で実際の状態を確認してください。
>
> bot で 24/7 運用する場合は、read-only profile → paper → dry-run → 本番の手順を [botter 運用 Runbook](docs/botter-runbook.md) にまとめています。

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
> 指値発注時は `price * amount + fee` 相当を JPY（買い）または `amount` を base 通貨（売り）で「ロック扱い」にします。`paper assets` の `available` は `total - locked` で、`available` 不足の指値発注は Err になります。手数料は対象ペアのライブ maker/taker レート（`/spot/pairs` 由来・24h キャッシュ。取得できないときのみ既定 0.12% にフォールバック）。スリッページは入っていません。

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
  上限は `--max-retries=<n>`（既定 100、有限）。`--max-retries=0` で
  「リトライしない」、`--max-retries=infinite` で明示 opt-in した場合のみ
  無限化する。上限到達時は `EXIT.NETWORK`（exit code 5）
- 無音検出は `--idle-timeout=<秒>`（既定 30）で発火し再接続フローへ
- depth / transactions など他チャネルは MVP 対象外（`bitbank stream` を使う）

Exit code は `cli/exit-codes.ts` の `EXIT` 定数で定義: `SUCCESS`(0) /
`GENERAL`(1) / `AUTH`(2) / `RATE_LIMIT`(3) / `PARAM`(4) / `NETWORK`(5)。
public（無認証）コマンドが HTTP 403 を受けた場合は鍵の失敗ではないため
`AUTH`(2) ではなく `GENERAL`(1) を返す（下記 Troubleshooting 参照）。
private / trade の 403 は本物の権限失敗として `AUTH`(2) のまま。

## Troubleshooting

初回セットアップで踏みやすい事象とその対処。

### `bitbank: command not found`

CLI がグローバルインストールされていない、または `npm i -g` 後に PATH へ
反映されていない可能性。`npm i -g bitbank-lab-cli` でインストールするか、
クローン済み環境では [クイックスタート](#クイックスタート) のフォールバック
手順（`npx tsx cli/index.ts ...`）で代替できます。

### `BITBANK API credentials are not configured` 系のエラー

Private API / Trade コマンドは認証情報が必要です。`bitbank profile add`
でプロファイルを登録するか、`BITBANK_API_KEY` / `BITBANK_API_SECRET` env
を設定してください。詳細は [セットアップ](#セットアップ) の
「API キーを設定する」節を参照。

### public コマンドで HTTP 403 / Forbidden

`ticker` や `candles` などの public（API キー不要）コマンドで HTTP 403 が
返る場合、原因は API キーではなく **IP / 地域 / ネットワーク制限**
（VPN・データセンター IP・地域ブロック・WAF 等）の可能性が高いです。この経路は
鍵を使わないため、CLI も exit code を `AUTH`(2) ではなく `GENERAL`(1) で返し、
エラーメッセージにその旨を付記します。制限のない回線（自宅 ISP 等）で再実行して
ください。private / trade コマンドの 403 は従来どおり認証失敗（`AUTH`(2)）として
扱われます。

### `npm test` が `sh: 1: vitest: not found` で落ちる

依存パッケージが入っていません。クローン直後は先に `npm ci` を実行して
ください（`CLAUDE.md` のコマンド節とも整合）。

### HTTP 429 / レートリミット

bitbank API のレートリミットに到達すると CLI は exit code 3
（`EXIT.RATE_LIMIT`）で終了します。API エラーコードと exit code の
マッピングは `cli/error-codes.ts` を参照。

### WebSocket が突然切れる / 再接続を繰り返す

`bitbank watch ticker` は指数バックオフで自動再接続し、無音検出で
再接続フローへ入ります。挙動とオプションの詳細は
[ライブ価格 watch（WebSocket ticker）](#ライブ価格-watchwebsocket-ticker)
を参照してください。

### plugin の skills が出てこない

`/plugin install` 後に skill がトリガーされない場合は、次の順で対処します。

1. **Claude Code を最新へ更新** — plugin 機能（`/plugin install` / `/reload-plugins` など）は新しめの本体が前提です（plugin 機能が安定して使えるのは概ね **v2.1 系以降**。古い版では slash command 自体が無いことがあります）。
2. **完全に再起動** — `/reload-plugins` で済ませず、一度 Claude Code を終了してから `claude` を起動し直す（起動時に skill が自動ロードされます）。
3. **それでも出ない場合はキャッシュを消して再インストール** — `rm -rf ~/.claude/plugins/cache/<plugin>` してから [Claude Code](#claude-code) の plugin install 手順で入れ直す。

> `/reload-plugins` の表示カウンタは実際のロード数と一致しないことがあります。数字を当てにせず、実際に skill を呼んで（例:「BTC の RSI を見て」）トリガーされるかで確認してください。

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

### `--machine`（プログラム・Skill 経由の利用）

スクリプトや Agent Skill から読む場合は `--format=json --machine` を併用してください。
`--machine` を付けると `{ success, data, partial?, meta? }` envelope が出力され、
candles の `meta.lastIsIncomplete` / `gaps` / `dedupedCount` / `truncated` といった
データ完全性メタが取れます（`--format=json` 単独だと `data` 配下しか出ません）。

```bash
bitbank candles btc_jpy --type=1day --format=json --machine
# → {"success":true,"data":{...},"meta":{"lastIsIncomplete":true,...}}
```

例外として `watch` / `stream`（JSONL ストリーム）、`completion`（補完出力）、
`profile add`（対話入力）には `--machine` を付けません。詳細は
[`skills/_shared/references/cli-conventions.md`](skills/_shared/references/cli-conventions.md)
を参照してください。

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
あくまでサンプルですので、ご自身の用途に合わせて追加・編集してください。Codex CLI / Antigravity CLI など他エージェントでの配置先は [使い方](#codex-cli--antigravity-cli-で使う) を参照してください。

共通の参照資料（`bitbank-api-formats.md` 等）は `skills/_shared/references/` に集約しており、各 Skill から参照されます。

> Skill の使い所はこちら → [Skill 使い所ガイド](docs/skill-workflow.md)
> 全 Skill の責務・カテゴリ・代表トリガーの一覧（正典カタログ）→ [Skills Index](skills/INDEX.md)

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

`skills/<name>/SKILL.md` を作成するだけで独自 Skill を追加できます（`.claude/skills/` も互換 symlink で読めます）。詳細は [カスタマイズガイド](docs/customization-guide.md) を参照してください。

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

バグ報告・機能リクエストは [GitHub Issues](https://github.com/bitbankinc/bitbank-lab-cli/issues) へお願いします。

## 免責事項

### 開発段階について

本ツールは開発段階（ベータ版）です。バグ、不具合、誤動作、または不正確な分析結果を含む可能性があります。

### AI エージェントによる処理結果について

本MCPサーバー / 本CLIツール が提供するデータを AIエージェント等が処理・生成した結果について、正確性、完全性、有用性、最新性を保証するものではありません。AI エージェント等による処理の結果、注文種別、価格、数量その他の取引条件が利用者の意図と異なる形で処理または実行される可能性があります。

### 金融商品取引法上の位置づけ

本ツールは情報提供のみを目的として提供されるものであり、投資助言・代理業、投資勧誘、その他金融商品取引法上の行為を目的とするものではありません。

### 外部サービスへの依拠

本ツールは外部API、LLM、第三者サービス等に依拠して提供するものであり、これらの仕様変更、停止、不具合等が生じた場合には、本ツールが正常に動作しない可能性があります。

### 安全対策の補助性

本ツールに実装されている最終注文確認機能、バリデーションその他の安全対策は、誤操作または誤発注等を防止するための補助機能であり、その完全な防止を保証するものではありません。

### 利用者の責任

利用者は、本ツールにより提供・生成された情報および注文内容等を自身で十分に確認の上、自己の判断と責任において本ツールを利用し、投資判断、注文実行および取引を行うものとします。

### 損害の免責

当社は、本ツールの利用もしくは利用不能、または本ツールにより提供・生成された情報、AI エージェント等による処理結果もしくは取引操作に基づく投資判断・注文・取引等に関連して生じたいかなる損害についても、当社の故意または重過失による場合を除き、一切責任を負いません。

### APIキー・認証情報の管理

APIキーおよび取引に必要なパスワード等は利用者自身の責任において適切に管理してください。チャット欄や公開リポジトリその他第三者が閲覧可能な環境等へ APIキーや取引パスワード等の認証情報等を入力・掲載しないよう十分ご注意ください。

利用者による認証情報等の管理不備、誤入力、漏えい、第三者利用等により生じたいかなる損害についても、当社の故意または重過失による場合を除き、当社は一切責任を負いません。

## 開発

```bash
npm test           # テスト実行（E2E はスキップ）
npm run test:watch # ウォッチモード（変更を監視して再実行）
npm run lint       # Biome lint
npm run typecheck  # 型チェック
```

`npm test` では実 API を叩く E2E ブロックは `TEST_E2E=1` で gating されており、デフォルトでは skip される。実 API に対する E2E を走らせる場合は `TEST_E2E=1 npm test` を指定する（`.env.example` の API キー設定が必要）。

### リリース

npm publish 手順とバージョン同期の仕組みは [`docs/dev/release.md`](docs/dev/release.md) を参照。`npm version <bump>` で 5 ファイル一括同期されるので、`package.json` や plugin manifest を手動編集しないこと。

### コントリビューター向けセットアップ

このリポジトリ自体に PR を送る場合は、Claude Code 用の hook をローカルで
有効化してください:

    ./.contrib/setup.sh

これで lint / test / 設定保護の hook が `.claude/` 配下に symlink で
復元されます。`.claude/settings.json` と `.claude/hooks/` は `.gitignore`
済みなのでコミットには含まれません。詳細は `.contrib/README.md` を参照。

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
    trade/              # 資金操作・ドライランデフォルト（5）
    paper/              # ペーパートレード（ライブ価格 × ローカル state、9）
    stream.ts           # リアルタイムストリーム
  __tests__/            # 全コマンドのテスト（件数は npx vitest run 参照）
skills/                 # Agent Skills（12本 + _shared/references/）
docs/                   # ADR・フェーズ管理・カスタマイズガイド
.contrib/               # コントリビューター向け hook tooling（clone 利用者は不要）
```

#### エージェント連携エントリ

各エージェントが固有のパス検出規約を持つため、root に複数のエントリが必要です。Markdown は `CLAUDE.md` を実体に symlink で集約しており内容の重複はありません。plugin manifest は各エージェントの仕様に合わせて個別に持っています。

| エントリ | 何用か | 種別 |
|---|---|---|
| `CLAUDE.md` | Claude / Cursor 用エージェント指示書 | file（canonical） |
| `AGENTS.md` → `CLAUDE.md` | Codex / Aider 等の AGENTS.md 規約 | symlink |
| `CONTEXT.md` → `CLAUDE.md` | 旧 Gemini CLI の `contextFileName` 規約（Antigravity CLI は `AGENTS.md` を読む） | symlink |
| `.claude/` | Claude Code の local skills + rules | dir（内部に `skills` → `../skills` の symlink） |
| `.claude-plugin/` | Claude Code plugin marketplace | dir（`plugin.json` / `marketplace.json`） |
| `.cursor-plugin/` | Cursor plugin | dir（`plugin.json`） |
| `.codex-plugin/` | Codex CLI plugin | dir（`plugin.json`） |
| `plugin.json` | Antigravity CLI ネイティブ plugin manifest（skills は `skills/<name>/SKILL.md` を自動検出） | file |
| `gemini-extension.json` | 旧 Gemini CLI extension manifest（新旧両 CLI から install できるよう `plugin.json` と両置き） | file |
