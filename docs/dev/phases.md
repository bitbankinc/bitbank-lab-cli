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

---

## Phase 6: 税務・会計データ整形（進行中）

**リスクレベル:** なし（private GET とローカル計算のみ。trade エンドポイントには触れない）
**成果物:** 計画・スコープ・週次詳細は [`tax-roadmap.md`](tax-roadmap.md)、アーキテクチャ決定は ADR-004
**ドッグフーディング基準:** 実データで年間取引報告書（現物・信用の 2 本）と突合し、差分ゼロまたは差分を説明可能（検証アンカー 1）。税務 SaaS との突合は**参考**に降格済み（他社実装との相互検証であって正しさの定義ではないため。tax-roadmap.md「検証アンカー」）
**完了条件:** **CLI で税計算が機能することの確認まで**。MCP Tool 化はスコープ外（2026-07-28 の製品判断。tax-roadmap.md「スコープ外へ移した週」）

### 計画・意思決定

- [x] ロードマップ策定（`docs/dev/tax-roadmap.md`）
- [x] ADR-004: 損益計算ロジックを CLI 内 `tax` カテゴリに例外として実装
- [x] API 履歴保持期間ほか前提リスク 6 項目の実機確認（実機確認 #1〜#6）
- [x] 税制調査結果の反映（tax-research.md v2 受領・反映済み）
- [x] 正規化フォーマットの決定 → **汎用フォーマット**（SaaS 個別対応は P2）
- [x] ADR-005: 厳密有理数と「丸めは境界で 1 回だけ」

### 実装

- [x] 生データ取得の網羅化（全ペア横断・入出金ページング・JST 年境界ヘルパー）
- [x] 正規化コマンド（段階 2）＋ CLI Skill（A 層向け）
- [x] 損益計算コマンド（段階 3・tax カテゴリ）＋ Skill 統合（B 層向け）
- [x] CLAUDE.md / commands.md への tax カテゴリ・例外条項追記
- [x] 年間取引報告書との突合（`tax verify-report`。現物・信用の 2 様式）
- [x] 課税方式パラメータ（課税年度 → 課税方式のマッピング）
- [x] 実データ検証: 残高突合・年間取引報告書突合（現物・信用）（実機確認 #8〜#13。
      #12・#13 で最新 main へ鎖を再接続）。`pnl` は**表示ガードの挙動確認まで**
- [x] 国税庁計算書 互換モード（検証アンカー 2。`cli/tax/compat/nta-sheet.ts`）
- ~~MCP Tool 化~~ → **スコープ外**（CLI の確認が先。着手時は本書とは別に管理する）

### 完了条件外（外部入力が来たら着手・2026-07-30 整理）

次の 3 件は**外部入力が揃うまで着手できず、かつ完了条件のブロッカーにもしない**。
どれも「実装が未完成」ではなく「**実データでまだ観測できていない**」という性質で、
未観測のまま公開しても**未観測・未対応であることが利用者に伝わる**ことを確認したうえでの
整理である（根拠は tax-roadmap.md「完了条件外へ整理した 3 件」）。
**実データでの数値の正しさを保証するものではない**——保証しているのは検出可能性のほう。

- `pnl` の本番数値検証 — 前年繰越 JSON の入手待ち。繰越が未確定な銘柄は
  表示ガード (c) が数値を止めるため、未検証の値が出ることはない
- 信用の支払手数料の抽出ウィンドウ確認 — 取引所側への照会待ち。**CLI 側の作業ではない**。
  混入があれば `tax verify-report --margin-csv` が `margin_fee` を `REPORT_EXCESS` に立てる
- 未観測のデータ形状 3 種 — 別検体待ち。**検出経路は 3 つとも違う**:
  ショート建玉は `roleOf` の単体テスト、年末持ち越し建玉は取込時の「未決済建玉」警告と
  報告書側の `unsupported`、年をまたぐ建玉は「決済数量が建玉残を超えています」の警告
  （前年の OPEN が年ウィンドウの外に落ちるため）。
  **実データでの検証は未了**（信用損益は表示ガードの対象外）

---

## Phase 7: 信用取引の新規建て・返済注文（計画）

**リスクレベル:** 資金操作（損失が証拠金を超え得る）
**成果物:** `cli/commands/trade/create-margin-order.ts`、共通化した `order-body.ts` / `margin-operation.ts`、ADR-009
**計画書:** [`margin-order-plan.md`](margin-order-plan.md)（スコープ・設計判断・実機確認項目はそちらが単一ソース）
**ドッグフーディング基準:** 「返済のつもりで新規建て」が構造的に起こらないこと（API 側は #M-6 で 50062 拒否を確認済み。CLI 側は dry-run の操作ラベルと `--intent` クロスチェックで承認前に可視化する）

### 計画・意思決定

- [x] 開発計画（`margin-order-plan.md`）
- [x] ADR-009: 信用注文を `trade create-margin-order` として分離（フレーズも分ける）（[009-margin-order-separate-command.md](../adr/009-margin-order-separate-command.md)）

### 実装

- [x] エラーコード登録（40164 / 40167 / 50058〜50062 / 50081〜50084 / 60019）＋ `error-catalog.json` 再生成
- [ ] `margin-positions` の前提修正（`locked_amount` を露出、`--pair` を CLI 側フィルタに）
- [ ] `create-order.ts` から `order-body.ts` / `margin-operation.ts` を切り出し（既存テスト無変更で green）
- [ ] `create-order` が `--position-side` を `PARAM` で拒否する
- [ ] `trade create-margin-order`（`--position-side` 必須・`take_profit`/`stop_loss`/`losscut` 拒否・dry-run に操作ラベル・手数料見積りなし）
- [ ] `CONFIRM_PHRASES` に `I-UNDERSTAND-CREATE-MARGIN-ORDER`、`x10` の件数を 6 に更新
- [ ] `defs-trade.ts` / `trade-handlers.ts` 登録、`tool-catalog.json` 再生成

### テスト

- [ ] `--execute` なし / `--execute` 単独 / フレーズ不一致 / 現物フレーズ流用で fetch が呼ばれない
- [ ] 4 組合せ（buy×long / sell×long / sell×short / buy×short）のラベルと `--intent` 不一致の拒否
- [ ] body に `position_side` が入り、レスポンスの `position_side` をパースする

### ドキュメント

- [ ] `trading-safety.md` フレーズ表 / `commands.md` / README Trade 表 / `botter-runbook.md` / CHANGELOG

### 実機確認（信用審査済みアカウント）

- [x] `pairs` に信用対応フラグが無いことを確認（信用対応ペアは `margin-status` の `available_balances` が唯一の情報源）
- [x] #M-6: 建玉なしの返済方向は 50062 で拒否される（逆方向の新規建てにならない）→ `--intent` は任意のまま
- [ ] #M-1〜#M-5（計画書 §4 Step 6）。#M-4 は #M-1 で建てた注文で確認
