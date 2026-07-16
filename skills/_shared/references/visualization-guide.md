# 可視化（グラフ化）規約

全 skill 共通のチャート描画ルール。SKILL.md からは
`_shared/references/visualization-guide.md` で参照する。

## 位置づけ

- 可視化は **skill レイヤーの責務**。CLI は描画しない
  （ADR-002: CLI は分析ロジックを持たない薄いアクセス層。損益曲線・相関行列
  などの描画対象は **モデルが計算した分析結果** であり、CLI を通らない）
- 各 skill の SKILL.md「可視化（オプション）」節が **チャート仕様**
  （何を・どの軸で・どの参照線と共に描くか）を定義し、本ガイドが
  **描画方法の規約**（実行環境・出力先・スタイル・安全規律）を定義する。
  仕様と方法を分離しているため、将来レンダリング手段を差し替えても
  （HTML/SVG 出力・外部レンダラー等）各 skill のチャート仕様は変わらない
- 描画コードはモデルが実行時に生成する。SKILL.md に完成した描画スクリプトを
  同梱しない（Skill はモデルへの指示書 — `.claude/rules/skills.md`）

## トリガー規律（デフォルト off）

- 可視化は **opt-in**。以下のときだけ描く:
  1. ユーザーが明示的に求めた
     （「グラフで」「図にして」「チャートにして」「可視化して」「plot して」等）
  2. skill のテキスト出力後に「標準チャートも描けます」と 1 行提案し、同意を得た
- チャートは分析テキスト出力の **併産物**。テーブル・サマリーの置き換えにしない
- 分析だけを頼まれた場合に勝手に描かない（実行コスト・環境依存を増やさない）

## 実行環境の解決手順

描画前に、以下の順で描画手段を解決する（`cli-conventions.md` の
「起動方法の解決手順」と同じ規律。推測で環境を探し回らない）。

1. `python3 -c "import matplotlib"` が通る → **matplotlib で PNG 出力**（標準経路）。
   非対話バックエンドを必ず指定する（`matplotlib.use("Agg")`）。GUI バックエンドで
   ブロックしたり `plt.show()` で止めたりしない（Windows 等で `python3` が
   ない場合は `python` / `py -3` で同じ確認をする）
2. 通らない場合は **描画しない**。ユーザーに「チャート出力には matplotlib が
   必要です。`python3 -m pip install matplotlib` でインストールしてください」と
   案内し、従来どおりのテキスト出力（テーブル + 簡易 ASCII バー）に留める
3. matplotlib 以外のライブラリ（seaborn / plotly / mplfinance 等）は **前提にしない**。
   導入済み環境で使うのは自由だが、全標準チャートは matplotlib 単体で
   描ける仕様にしておく

## 出力先とファイル名

- 出力先はカレントディレクトリ直下の `./bitbank-charts/`（なければ作成する）
- ファイル名: `<チャート ID の . を - に置換>-<対象>-<YYYYMMDD-HHmmss>.png`
  - `<対象>` はペア（`btc_jpy`）、複数ペアの連結（`btc_jpy-eth_jpy`）、
    またはポートフォリオ全体なら `portfolio` のような対象スラッグ
  - `<YYYYMMDD-HHmmss>` は **UTC 基準**（リポ規約「日付キーは UTC」と同じ。
    JST やローカル時刻を使わない）
  - 例: `backtest-equity-curve-btc_jpy-20260715-133005.png`
- **1 図 1 ファイル**。複数チャートを 1 枚に詰め込まない（サブプロットは
  同一チャート ID の構成要素に限る）
- 既存ファイルを上書きしない（timestamp で衝突回避）。ディレクトリの整理・削除は
  ユーザーに任せる
- 保存後、生成したファイルのパスを必ずユーザーに提示する

## チャート ID 規約

- 各 skill の標準チャートには `<skill-name>.<kebab-case-slug>` 形式の
  **安定 ID** を振る（例: `backtest.equity-curve`、`correlation-analysis.heatmap`）
- ID は SKILL.md の「可視化（オプション）」節で定義する。prefix は skill の
  ディレクトリ名と一致させる（chaos `s11` が prefix 一致と一意性を検査する）
- ID は将来のレンダリングバックエンド差し替えや機械可読カタログ化の
  安定インターフェース。**リネームは breaking change** として扱う

## スタイル規約

- **ラベル・タイトルは英語で書く**（日本語は環境依存のフォント豆腐が出るため）。
  ユーザーが日本語フォントを導入済みと明言した場合のみ日本語可
- 複数系列には凡例を必ず付ける。色は matplotlib 既定（tab10）で可。
  色だけに頼らず線種・マーカーでも区別できるとなお良い
- y 軸の単位を明記する（JPY / % / r 等）。対数リターンか単純リターンかも
  ラベルに書く
- 相関行列など −1〜+1 の値は、0 を中心とした diverging カラーマップ
  （例: `RdBu_r`、`vmin=-1, vmax=1`）で描き、セルに数値を注記する
- グリッドは薄く（`alpha=0.3` 程度）。装飾より判読性を優先
- 推奨保存パラメータ: `figsize=(10, 6)` 目安、`dpi=150`、`bbox_inches="tight"`

## 来歴フッター（必須）

すべてのチャートに、データの来歴を図中に焼き込む（脚注 or サブタイトル）:

- pair / 足種（type）/ 期間 / サンプル数 N
- 取得時刻（envelope `meta.fetchedAt`）
- 末尾未確定足を除外した場合は `last incomplete candle excluded`
- `gaps` / `truncated` / `partial` があった場合はその旨
- **時刻表記はフッター・ファイル名とも UTC（`Z` 付き）で統一**する
  （例: `fetched 2026-07-15T04:00Z`。`local` 表記や JST を混ぜない。
  JST はテキスト本文側の説明でのみ使う）

例:

```
btc_jpy 1day 2024-01-01..2024-12-31 N=365 | fetched 2026-07-15T04:00Z | last incomplete candle excluded
```

チャート画像は会話から切り離して共有・保存されることがあるため、
単体でも「いつ・何の」データか分かる状態にする。

## 安全規律

- **チャートは記述的表現であり売買シグナルではない。** 「BUY」「SELL」の注記、
  推奨方向の矢印、目標価格ラインを **モデルの判断で描き込まない**。
  backtest の約定マーカーは過去のシミュレーション約定の記録であり推奨ではない
  （凡例では `simulated entry` / `simulated exit` と表記する）
- skill 本文が出力に義務付けている注意書き（「コスト・サイジング無視」
  「ショートは方向検証用」等）は、対応するチャートにも同じ趣旨の文言を焼き込む
- リーク検証系チャート（shift(1) 有無の比較）には
  `VALIDATION ONLY — do not trade the no-shift series` を図中に明記する
  （backtest Step 3.5 / signal-explorer Step 7 の使い捨てパスと同じ扱い）
- 未確定足・欠損（`lastIsIncomplete` / `gaps`）を含めたまま描かない。
  除外規律は各 skill 本文のデータ整形と同じ
- 保有資産・評価額など **口座情報を含むチャート**（portfolio 等）は共有時に
  注意が必要。ユーザーが画像共有を前提にしている場合は、絶対額ではなく
  比率表示への切替を提案する

## 共通プリアンブル（参考実装）

描画コードを生成するときの基準形。**分析ロジックはここに書かない**
（計算は各 skill 本文の手順で済ませ、描画には計算済みの系列だけを渡す）。

```python
import matplotlib
matplotlib.use("Agg")  # non-interactive: never block on GUI
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(10, 6))
# ... plot precomputed series here ...
ax.grid(alpha=0.3)
ax.set_title("Equity curve: SMA cross (20/50) on btc_jpy 1day")
ax.set_ylabel("Equity (JPY)")
ax.legend()
fig.text(0.01, 0.01,
         "btc_jpy 1day 2024-01-01..2024-12-31 N=365 | fetched 2026-07-15T04:00Z"
         " | last incomplete candle excluded",
         fontsize=7, color="gray")
fig.savefig("bitbank-charts/backtest-equity-curve-btc_jpy-20260715-133005.png",
            dpi=150, bbox_inches="tight")
plt.close(fig)
```

## recipe での扱い

recipe は自前のチャートを定義しない（「recipe 自体は計算をしない」原則と同型）。
構成 skill の標準チャートを、その skill の step 内で必要に応じて描く。
