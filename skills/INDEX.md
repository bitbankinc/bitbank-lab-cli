# Skills Index

bitbank-cli-skills の Skill 一覧。

- **Primitive Skill** — 単一の責務を持つ Skill。ユーザーの発話に直接反応する
- **Recipe Skill** — 複数の primitive を順に呼ぶ複合 Skill。`recipe-` プレフィックス、`metadata.recipe: true` を持つ（→ [`.claude/rules/skills.md`](../.claude/rules/skills.md)）

Skill の追加・recipe 化の原則は [`.claude/rules/skills.md`](../.claude/rules/skills.md) を参照。

## カテゴリ

| カテゴリ | 役割 |
|---|---|
| [Market Read](#market-read相場の読み) | 現在の相場・指標を読む |
| [Risk & Statistics](#risk--statisticsリスク特性統計) | 単一銘柄／銘柄間の統計的特性を定量化 |
| [Signal & Strategy](#signal--strategyシグナル戦略検証) | シグナルの予測力・戦略の PnL を検証 |
| [Portfolio](#portfolio保有資産) | 保有資産の評価 |
| [Operations](#operations運用補助) | データ品質・プロファイル・練習用 sim |
| [Recipes](#recipes複合ワークフロー) | 複数 Skill を束ねた意思決定単位 |

---

## Market Read（相場の読み）

| Skill | 説明 | 代表トリガー |
|---|---|---|
| [`indicator-analysis`](indicator-analysis/SKILL.md) | SMA / RSI / MACD / BB の現在値を計算し、トレンド・売買シグナルを読む | 「RSI 見て」「今買い時？」「相場の雰囲気は？」 |
| [`watch-live`](watch-live/SKILL.md) | WebSocket public stream で ticker をリアルタイム watch（要 `--duration` / `--count`） | 「ticker をライブで見たい」「リアルタイム価格監視」 |

## Risk & Statistics（リスク特性・統計）

| Skill | 説明 | 代表トリガー |
|---|---|---|
| [`volatility-profile`](volatility-profile/SKILL.md) | 単一銘柄のリスク特性（歪度・尖度・ファットテール倍率・時間帯出来高・√T 比） | 「BTC のボラどう？」「ストップ幅どう決める？」 |
| [`correlation-analysis`](correlation-analysis/SKILL.md) | 銘柄間の Pearson/Spearman 相関、β、ローリング相関、環境別相関、ラグ相関 | 「BTC-ETH の相関は？」「分散投資効果はある？」 |

## Signal & Strategy（シグナル・戦略検証）

| Skill | 説明 | 代表トリガー |
|---|---|---|
| [`signal-explorer`](signal-explorer/SKILL.md) | 任意のシグナル候補の予測力を将来リターン相関・Z-score・ラグ相関・リーク検証から評価 | 「RSI、本当に効く？」「この指標に予測力ある？」 |
| [`backtest`](backtest/SKILL.md) | コスト・サイジング・複利込みで戦略 PnL・勝率・DD を算出 | 「SMA クロス戦略をバックテストして」「勝率どのくらい？」 |

レイヤーの関係：`indicator-analysis`（現在値の読み）→ `signal-explorer`（予測力スクリーニング）→ `backtest`（コスト込み PnL）。

## Portfolio（保有資産）

| Skill | 説明 | 代表トリガー |
|---|---|---|
| [`portfolio`](portfolio/SKILL.md) | 保有資産の構成・JPY 建て評価額・含み損益 | 「ポートフォリオの状況を見せて」「含み益ある？」 |

## Operations（運用補助）

| Skill | 説明 | 代表トリガー |
|---|---|---|
| [`data-verification`](data-verification/SKILL.md) | ローソク足データの品質検証（欠損足・OHLCV 整合性・異常値）。**明示依頼時のみ起動** | 「データ検証して」「欠損ないか確認して」 |
| [`profile-management`](profile-management/SKILL.md) | `profiles.json` の CRUD（複数 API キーの切替） | 「API キー追加して」「profile 一覧」 |
| [`paper-trade`](paper-trade/SKILL.md) | 仮想資金でのペーパートレード（実 API は public ticker のみ） | 「BTC を仮想で買って」「ペーパー口座の残高見て」 |

## Recipes（複合ワークフロー）

| Recipe | 構成 Skill | 代表トリガー |
|---|---|---|
| [`recipe-pre-trade-check`](recipe-pre-trade-check/SKILL.md) | `portfolio` → `volatility-profile` → `data-verification` → `indicator-analysis` | 「買う前にチェックして」「エントリーしていい？」 |
| [`recipe-portfolio-review`](recipe-portfolio-review/SKILL.md) | `portfolio` → `correlation-analysis` → `volatility-profile` | 「ポートフォリオを見直したい」「分散効いてる？」 |

---

## 選択ガイド（迷ったとき）

- **「今買い時？」** → `indicator-analysis`（単一指標の読み）／ `recipe-pre-trade-check`（総点検）
- **「この指標／戦略は儲かる？」** → 予測力なら `signal-explorer`、コスト込み PnL なら `backtest`
- **「リスクは？」** → 単一銘柄なら `volatility-profile`、銘柄間関係なら `correlation-analysis`
- **「リーク検証したい」** → 単独 Skill はない。`signal-explorer` Step 7 / `backtest` Step 3.5 に組み込み済み
- **個別 Skill が複数該当しそう** → recipe が該当するか先に確認

## 共通リファレンス

[`_shared/references/`](_shared/references/) に全 Skill 共通の資料がある：

- `bitbank-api-formats.md` — API レスポンス形式
- `pair-classification.md` — ペア分類（流動性・カテゴリ等）
- `cli-conventions.md` — CLI 呼び出し規約（`--format=json` / Result パターン等）
- `error-catalog.md` — bitbank API エラーコードと対処
