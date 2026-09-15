# Skill の使い所ガイド

全 14 の Skill をどう組み合わせて使うかの一例です。「現状把握 → 環境分析 → 仮説検証 → 戦略評価 → モニタリング」の流れに沿って使い分けるのがおすすめです。

内訳は分析コア 8（portfolio / volatility-profile / correlation-analysis / data-verification / indicator-analysis / signal-explorer / backtest / periodical-brief）＋ ペーパートレード（paper-trade）＋ ユーティリティ 2（profile-management / watch-live）＋ 税務（tax-report）＋ recipe 2（recipe-pre-trade-check / recipe-portfolio-review）です。

> **各 Skill の責務・カテゴリ・代表トリガーの一覧は正典カタログ [`skills/INDEX.md`](../skills/INDEX.md) に集約しています。** 本ガイドは「どの順で使うか」という流れに絞っているので、個々の Skill の詳細や呼び出し例はそちらを参照してください（数の二重管理を避けるため、列挙は INDEX.md 側を正とします）。

## 投資ワークフローでの活用

### 1. 現状把握

- **portfolio**：保有資産と損益を確認。何を増やす / 減らす検討の出発点。

### 2. 環境分析（マクロ的に市場を見る）

- **volatility-profile**：今のリスクは過熱気味か？ ストップ幅をどう置くべきか？
- **correlation-analysis**：分散投資が効いているか／下落時の連動度は？

### 3. 個別銘柄チェック（売買判断の「読み」）

- **data-verification**：分析前にデータの健全性を担保（任意）。
- **periodical-brief**：複数銘柄の商い状況を 1 銘柄 3 行で一覧（毎朝の入口。気になった銘柄を次へ回す）。
- **indicator-analysis**：RSI・MACD・BB 等で現在地を把握。

### 4. 仮説検証（その指標、信じていいの？）

- **signal-explorer**：気になった指標やアイデアの**予測力**を統計的に評価。
  - 効きそうなら次のバックテストへ。効かなければここで棄却。

### 5. 戦略評価

- **backtest**：採用候補の戦略を過去データでシミュレーション（勝率・DD・PnL）。

### 6. 実行 〜 モニタリング

- 実行後は再び **portfolio** で資産推移を追跡。
- 定期的に **volatility-profile** / **correlation-analysis** で環境変化を再評価。
- 値動きを張り付いて見たいときは **watch-live**（WebSocket ticker。要 `--duration` / `--count`）。

> 補助系：API キーを口座ごとに切り替える **profile-management**、実 API を叩かず仮想資金で売買練習する **paper-trade** は、上の流れと独立していつでも使えます。

### 7. 年が明けたら（確定申告）

- **tax-report**：年分の取引集計・残高突合・年間取引報告書との突合・参考損益。
  投資判断のループとは独立していて、年に一度だけ回すもの。出るのは**税計算用参考データ**
  であって税務上の所得金額ではない（計算は CLI 側に閉じている）。

## recipe — このワークフローを束ねたもの

上の流れを毎回手でたどる代わりに、代表的な組み合わせを一気通貫で実行する recipe があります。recipe 自体は計算をせず、各 step で対応する Skill を順に呼び、最後に総合判断を提示します（最終判断は人間が下す前提）。

- **[`recipe-pre-trade-check`](../skills/recipe-pre-trade-check/SKILL.md)**：「買う前に最低限これだけは見る」。`portfolio → volatility-profile → data-verification → indicator-analysis` を順に呼び、GO / WAIT / NO-GO を提示。上記「2. 環境分析」〜「3. 個別銘柄チェック」を束ねたもの。
- **[`recipe-portfolio-review`](../skills/recipe-portfolio-review/SKILL.md)**：保有ポートフォリオの「総点検」。`portfolio → correlation-analysis → volatility-profile` を順に呼び、健全 / 注意 / 要見直し を提示。上記「1. 現状把握」〜「2. 環境分析」を束ねたもの。

> 「買う前にざっと見て」「ポートフォリオを見直したい」のように全体を束ねたい発話では recipe が、「RSI 見て」「ボラどう？」のような個別の発話では単一 Skill が起動します。

## 役割の境界（混同しやすいポイント）

| 目的 | Skill |
|------|-------|
| 指標の**現在値**を見る | `indicator-analysis` |
| 指標の**予測力**を測る | `signal-explorer` |
| コスト込みで**戦略評価** | `backtest` |

この 3 つは似て非なるものなので、目的に応じて使い分けてください。役割の境界の全体像は [`skills/INDEX.md`](../skills/INDEX.md) の「選択ガイド」にもまとまっています。
