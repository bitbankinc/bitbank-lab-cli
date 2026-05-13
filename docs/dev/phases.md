# 開発フェーズ管理

> 各フェーズのタスクチェックリスト。次のセッションで「何をやるか」が一目でわかるようにする。

---

## Phase 0: プロジェクト初期セットアップ ✅

- [x] CLAUDE.md 作成
- [x] package.json 作成
- [x] .gitignore 作成
- [x] README.md 作成
- [x] ADR-001: CLI と MCP サーバーの分離
- [x] ADR-002: CLI に分析ロジックを持たない
- [x] docs/phases.md 作成

---

## Phase 1: CLI 基盤 + Public API コマンド（9コマンド） ✅

**リスクレベル:** なし
**成果物:** `cli/index.ts`, `cli/output.ts`, `cli/commands/public/*.ts`
**ドッグフーディング基準:** セットアップ手順書なしで `clone → npx bitbank ticker btc_jpy` が動くこと

### 基盤

- [x] `cli/index.ts` — サブコマンドルーター（エントリーポイント）
- [x] `cli/output.ts` — 出力フォーマッター（json/table/csv）
- [x] Public API クライアント共通処理
- [x] npm install → npx bitbank --help が動作する

### コマンド

- [x] `ticker` — 単一ペアのティッカー（価格・24h高安・出来高）
- [x] `tickers` — 全ペア一括ティッカー
- [x] `tickers-jpy` — 全JPYペア一括ティッカー
- [x] `depth` — 板情報（asks/bids 生データ）
- [x] `transactions` — 約定履歴（直近60件 or 日付指定）
- [x] `candles` — ローソク足OHLCV（全11時間軸）
- [x] `circuit-break` — サーキットブレーカー状態
- [x] `status` — 取引所ステータス
- [x] `pairs` — 全ペア設定情報（手数料・制限値等）

### テスト

- [x] 各コマンドのユニットテスト（API モック使用）
- [x] 出力フォーマッターのテスト（json/table/csv）

---

## Phase 2: HMAC認証基盤 + Private API 読み取り系（13コマンド） ✅

**リスクレベル:** APIキー漏洩のみ
**成果物:** `cli/auth.ts`, `cli/commands/private/*.ts`
**ドッグフーディング基準:** APIキー設定 → `npx bitbank assets` で残高表示まで5分以内

### 基盤

- [x] `cli/auth.ts` — HMAC-SHA256 認証
- [x] APIキー設定の仕組み（環境変数 or 設定ファイル）

### コマンド

- [x] `assets` — 保有資産一覧
- [x] `order` — 注文情報照会（単一）
- [x] `orders-info` — 複数注文一括照会
- [x] `active-orders` — アクティブ注文一覧
- [x] `trade-history` — 約定履歴（maker/taker・手数料込み）
- [x] `deposit-history` — 入金履歴
- [x] `unconfirmed-deposits` — 未確認入金一覧
- [x] `deposit-originators` — 入金元情報
- [x] `withdrawal-accounts` — 出金先アカウント一覧
- [x] `withdrawal-history` — 出金履歴
- [x] `margin-status` — 証拠金取引ステータス
- [x] `margin-positions` — ポジション情報

### テスト

- [x] 認証ロジックのユニットテスト
- [x] 各コマンドのユニットテスト（API モック使用）

---

## Phase 3: 注文・出金コマンド（6コマンド） ✅

**リスクレベル:** 資金操作
**成果物:** `cli/commands/trade/*.ts`, dry-run/confirm 機構
**ドッグフーディング基準:** 誤発注が構造的に不可能であること（Jackie が自分で検証）

### 基盤

- [x] dry-run / --execute 機構の実装
- [x] --confirm インタラクティブ確認の実装

### コマンド

- [x] `trade create-order` — 新規注文（--dry-run デフォルト、--execute で実行）
- [x] `trade cancel-order` — 注文キャンセル
- [x] `trade cancel-orders` — 複数注文一括キャンセル（最大30件）
- [x] `trade confirm-deposits` — 入金確認
- [x] `trade confirm-deposits-all` — 全入金確認
- [x] `trade withdraw` — 出金リクエスト（--execute + --confirm 必須）
  - **運用方針 (PoC スコープ)**: 実装・テスト・安全ガードは完備しているが、本 PoC では **AI エージェント経由での起動は非推奨**。人間が CLI から直接実行する用途のみとし、Skill / MCP からの自動起動フローは組まない。read-only な `withdrawal-accounts` / `withdrawal-history` は AI 経由でも利用可。

### テスト

- [x] dry-run モードのテスト（API が呼ばれないことを検証）
- [x] --execute フラグなしで API が呼ばれないことを検証
- [x] 各コマンドのユニットテスト（API モック使用）

---

## Phase 4: Stream — リアルタイムデータ（2コマンド） ✅

**リスクレベル:** なし
**成果物:** `cli/stream.ts`, `cli/commands/stream.ts`

### 技術的注意

- Private Stream の PubNub トークンは12時間で失効（自動再取得が必要）
- PubNub メッセージの到着順序は保証されない

### コマンド

- [x] `stream` — Public Stream（Socket.io、リアルタイム板・約定・ティッカー）
- [x] `stream --private` — Private Stream（ユーザーデータのリアルタイム配信）

### テスト

- [x] ストリーム接続・再接続のテスト（モック使用）

---

## Phase 5: Agent Skills（12本）+ references + カスタマイズガイド ✅

**成果物:** `.claude/skills/*/SKILL.md`, `.claude/skills/_shared/references/`, README 拡充
**ドッグフーディング基準:** Claude Code / Cursor で Skills が正しくトリガーされること

### Skills

- [x] `indicator-analysis` — 生OHLCVからモデルに任意の指標を計算させる
- [x] `backtest` — ストラテジーをモデルに定義・シミュレーションさせる
- [x] `portfolio` — 保有資産の損益分析・リバランス提案
- [x] `volatility-profile` — リターン分布・ファットテール・時間帯別出来高などリスク特性を定量化
- [x] `signal-explorer` — シグナル候補の予測力を評価（相関・Z-score・ラグ相関・冗長性チェック）
- [x] `correlation-analysis` — 複数銘柄間の相関・β・環境別相関・ラグ相関
- [x] `data-verification` — ローソク足の欠損・整合性・異常値・重複の品質検証

### ドキュメント

- [x] references（API リファレンス等。共通分は `_shared/references/` に集約）
- [x] カスタマイズガイド
- [x] README 拡充
