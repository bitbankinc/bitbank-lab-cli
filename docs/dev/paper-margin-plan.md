# ペーパートレードの信用取引 — 開発計画

> Phase 8 の計画書。`paper` サブコマンドに信用（margin）の新規建て・返済を足すための
> スコープ・前提となる事実・設計判断・実装ステップ・検証手順をまとめる。
> 進捗チェックリストは [`phases.md`](phases.md) の Phase 8、
> 設計判断は [ADR-010](../adr/010-paper-margin-simulation.md)（Proposed）に記録する
> （本書は計画であって ADR ではない）。

---

## 1. 現状と目的

### 現状（2026-11 時点）

| 領域 | 状態 |
|---|---|
| paper の**現物** | 実装済み。成行は ticker の last で即時約定、指値（GTC）は 1m 足の lazy tick で約定判定。state は v3（`cli/paper-state.ts`） |
| paper の**売り越し** | 不可。`computePositions`（`cli/paper-pnl.ts`）が `negative position detected ... (paper does not support short)` で止める |
| 信用の**読み取り**（実口座） | `margin-status` / `margin-positions` が実装済み（private GET） |
| 信用の**発注**（実口座） | Phase 7 で計画中。[ADR-009](../adr/009-margin-order-separate-command.md) は Accepted、実装は未着手 |
| paper の信用 | 未実装。[`margin-order-plan.md`](margin-order-plan.md) §1 で「証拠金・金利・ロスカットのモデルが要るので別フェーズ」とスコープ外にしていた |

### 目的

仮想資金で信用の**新規建て**と**返済**を練習できるようにする。

- 本番の `trade create-margin-order`（Phase 7）と**同じ語彙**（`side × position_side`）で書けるようにする。
  [`botter-runbook.md`](../botter-runbook.md) の「paper → dry-run → 本番」を、名前空間の差し替え
  （`paper` → `trade`）だけで進められる状態を保つ
- レバレッジを掛けたときの保証金率の動きと、ロスカットで建玉が強制決済される流れを、実資金を失わずに体験できるようにする
- 本番と一致させられない部分は**黙って近似しない**。仮定として申告する（§3.4）

### スコープ外（本フェーズでやらないこと）

- **代用暗号資産**（暗号資産を保証金に算入する。本番は掛目 50% 以下で算入する）。v1 の保証金は JPY 残高だけにする。
  保証金を少なく見積もる向きなので、ロスカットは本番より早く起きる（安全側）
- **法人口座**のリスク想定比率（`margin_current_company_ratio`）。個人口座を前提にする
- `stop` / `stop_limit` / `take_profit` / `stop_loss` 注文。現物 paper にも無い
- **ご利用可能額（与信枠）**。本番は個人の買いが 30 万〜3,000 万円、売りが 3,000 万円で、審査で決まる（§2.3）。
  paper には審査が無いので、保証金による制約だけを再現する
- **入金**。paper には入金コマンドが無い。追証・不足金の解消手段は返済と `paper reset` だけになる
- 部分約定・スリッページ。現物 paper と同じ前提（指値は指値ぴったり、成行は last）
- 信用の税務。`tax` は実口座専用で、paper の履歴は読まない

---

## 2. 使える情報源と、分からないこと

paper は **public の ticker・candlestick・pairs だけ**を叩く（CLAUDE.md の paper 例外節）。
信用のパラメータをどこまで public から取れるかが、このフェーズの成否を決める。

### 2.1 `GET /spot/pairs` の信用フィールド（public）

公式 [rest-api_JP.md](https://github.com/bitbankinc/bitbank-api-docs/blob/master/rest-api_JP.md)「銘柄詳細」の記述:

| フィールド | docs の説明 | 型 |
|---|---|---|
| `margin_open_maker_fee_rate_quote` | 新規建てmaker手数料率(クオート資産) | string \| null |
| `margin_open_taker_fee_rate_quote` | 新規建てtaker手数料率(クオート資産) | string \| null |
| `margin_close_maker_fee_rate_quote` | 決済maker手数料率(クオート資産) | string \| null |
| `margin_close_taker_fee_rate_quote` | 決済maker手数料率(クオート資産)（**docs の誤記と思われる**。名前は taker） | string \| null |
| `margin_long_interest` | ロング利息率/日 | string \| null |
| `margin_short_interest` | ショート利息率/日 | string \| null |
| `margin_current_individual_ratio` | 現在の個人のリスク想定比率 | string \| null |
| `margin_current_individual_until` | 現在の個人のリスク想定比率の適用終了日時（UnixTimeのミリ秒） | number \| null |
| `margin_next_individual_ratio` / `_until` | 次の個人のリスク想定比率 / その適用終了日時 | string \| null / number \| null |
| `margin_current_company_ratio` 他 | 法人の同等値（本フェーズでは使わない） | |
| `stop_margin_long_order` | ロング新規建て注文停止ステータス | boolean |
| `stop_margin_short_order` | ショート新規建て注文停止ステータス | boolean |

実際の値（`cli/__tests__/__fixtures__/tax/pairs-master.json`、2026-07-25 採取の無加工出力）:

- `margin_*` が**非 null なのは btc / xrp / eth / sol / doge の 5 ペアだけ**。他の JPY ペアはすべて null。
  この 5 ペアは、2026-09-15 の実機確認で `margin-status` の `available_balances` に出たペアと一致する
- 個人のリスク想定比率は 5 ペアとも `0.5`。法人は `0.0818`（btc）〜`0.5`（sol / doge）とペアで違う
- 利息率は 5 ペアとも `0.0004`。docs に単位の明記は無いが、税務調査の実測で
  **小数（0.04%/日）**と確定している（§2.4）
- 手数料率: 新規建て taker は btc が `0.001`、他が `0.0012`。maker は btc が `0`、他が `-0.0002`（リベート）
- `until` は火曜 23:59:59.999 JST で、current と next の差は 7 日。比率は週次で切り替わる

**CLI はこれらを捨てている。** `cli/commands/public/pairs.ts` の `PairSchema` と
`cli/pairs-cache.ts` の `CachedPairSchema` は `z.object` なので、未知キーは Zod が落とす。
`bitbank pairs` の出力にも pairs キャッシュにも `margin_*` は現れない。Step 1 で通す。

### 2.2 Phase 7 の前提との食い違い（#PM-0。2026-11-24 に確定）

[`margin-order-plan.md`](margin-order-plan.md) §2 と ADR-009 のコンテキストは
「`GET /spot/pairs` に信用対応フラグは無い（`is_enabled` / `stop_order` /
`stop_order_and_cancel` のみ）。信用対応ペアの唯一の情報源は `margin-status`」としている。

- 挙げられている 3 フラグは、CLI の `PairSchema` が持つ boolean と**ちょうど同じ**。
  CLI の出力（未知キーが落ちた後）を見て確認した可能性が高い
- 生レスポンスには `stop_margin_long_order` / `stop_margin_short_order` があり、
  信用非対応ペアでは `margin_*` が null になる（§2.1）
- 「信用対応」を表す boolean そのものは確かに無い。なので「フラグは無い」は字義どおりには正しい。
  ただ、**`margin_current_individual_ratio` が非 null かどうかで信用対応ペアを判定できる**

**2026-11-24 に最新の生レスポンスで確認した。** 62 ペアすべてに信用の 16 フィールドがあり、
`margin_current_individual_ratio` が非 null なのは btc / xrp / eth / sol / doge の 5 ペアだけ（2026-07-25 と同じ）。
信用非対応のペアは `margin_*` がすべて null で、`stop_margin_*` は取扱いを終えたペア（mkr / enj / rndr / matic など）と
BTC 建てペアで `true`、他は `false`。sol / doge の比率の `until` は `253402300799999`（9999-12-31 23:59:59.999 UTC、
期限なしの印）で、`next` は null。協会が比率を公表していない銘柄は個人と同じ 50% を使う、というルール（§2.3）と合う。

したがって ADR-009 決定 4 の「非対応ペアは CLI 側で事前に弾けない」という前提は見直せる
（本フェーズの範囲外。ADR-009 は main に入っているので、書き換えずに別途扱う）。

### 2.3 bitbank の公表ルール（2026-11-24 に原文を確認）

[信用取引ルール](https://bitbank.cc/guide/margin-trading-rule) と
[暗号資産信用取引の契約締結前交付書面](https://bitbank.cc/doc/prior-confirmation/margin) の原文から。
計算はすべて**口座単位**（建玉単位ではない）。

| 項目 | 定義 |
|---|---|
| 受入保証金合計額 | 差入保証金 + 建玉評価損益 − 未収費用 |
| 差入保証金 | 保証金現金（預託した日本円）+ 代用暗号資産（時価 × 代用掛目 0.5）。貸して増やす利用中・出金申請中の資産は除く |
| 建玉評価損益 | 買い: (評価時の価格 − 平均建値) × 建玉数量 / 売り: (平均建値 − 評価時の価格) × 建玉数量 |
| 未収費用 | 未収の信用取引売買手数料 + 利息 + 決済損金 + 不足金。決済時に日本円で清算 |
| 維持必要保証金額 | (建玉数量 × 平均建値) × リスク想定比率 |
| 約定時必要保証金額 | (新規建て指値数量 × 指値価格 + 新規建て成行数量 × 評価時の価格) × リスク想定比率 |
| 必要保証金額 | 維持必要保証金額 + 約定時必要保証金額。新規建ては、受入保証金合計額がこれ以上になるときだけ出せる |
| 保証金率 | 受入保証金合計額 ÷ 建玉（保有分） |
| リスク想定比率 / レバレッジ | 個人 50% / 2 倍。会社の判断で大きく設定されることがある。法人は協会公表値から算出（未公表の銘柄は 50%） |
| 追加保証金 | **毎日 15 時の時点で** 維持必要保証金額 > 受入保証金合計額 なら発生。**解消期限は基準時から 24 時間以内**。差入方法は ①日本円の入金 ②暗号資産の預入 ③現物暗号資産の売却 ④建玉の決済 |
| 強制決済 | ① **随時**、(維持必要保証金額 × 強制決済掛け目 0.5) > 受入保証金合計額 ② 追加保証金が解消期限までに解消しない。発動すると**新規発注中の注文を取り消し、建玉すべてを成行で決済** |
| 建玉の管理 | 平均法。同じペア・同じ売買区分の建玉は加重平均で一元管理し、部分決済も平均取得価格で損益を出す |
| 売買手数料 | 新規建て時と決済時に発生し、決済時に徴収。**部分決済では、新規建て時の手数料のうち決済割合に応じた額 + 決済時の手数料**を徴収 |
| 利息・暗号資産貸付料 | 買建ては法定通貨に係る利息、売建ては暗号資産貸付料。平均取得価格を基準に、建玉数量と建玉日数に応じて日歩で計上。建玉金利 0.04%/日（年率 14.60%） |
| ご利用可能額 | 個人: 買い 30 万〜3,000 万円、売り 3,000 万円。法人: 5,000 万円 |

保証金率を割合で言い換えると（P = 建玉（保有分）、r = リスク想定比率）、維持必要保証金額 = P × r なので、
**追証は保証金率 < r（個人 50%）、強制決済は保証金率 < r × 0.5（個人 25%）**になる。

実口座の API（private）が返す状態は次のとおり（rest-api_JP.md）:

- `margin-status` の `status`: `NORMAL` / `LOSSCUT`（強制決済中）/ `CALL`（追証発生中）/ `DEBT`（不足金発生中）/ `SETTLED`（債権売却済）
- `margin_call_percentage`（追加保証金率%）と `losscut_percentage`（強制決済率%）。上のルールから、
  それぞれ r × 100 と r × 0.5 × 100 にあたると読める（実口座での確認はしていない）
- `margin-positions` の `losscut_threshold`（強制決済掛け目。`individual` / `company`）と
  `notice`（`margin_call` / `debt` / `settled`、金額と対応期限）

未確定項目の状態（2026-11-24。§2.4・§2.5 と上のルールを反映）:

| # | 項目 | 状態 |
|---|---|---|
| #PM-0 | 信用対応ペアの判定 | **確定（§2.2）** |
| #PM-1 | 追証・ロスカットのしきい値 | **確定（上の表）。** 残るのは追証の「解消」の判定の細部（差入方法の 4 つに価格の回復は無いが、価格の回復だけで解消扱いになるかは書かれていない） |
| #PM-2 | 保証金率の算式 | **確定（上の表）。** 分母の「建玉（保有分）」は、維持必要保証金額の式と、`open_margin_position_product` が建玉ごとの `product`（建値基準）の合計と一致した姉妹リポの実口座確認から、**建値基準**と読む。`available_balances` の算式は書かれていないが、新規建ての条件（必要保証金額以上）は分かったので paper はそれを使う |
| #PM-3 | 利息 | **確定（§2.4 の実測 + 上のルール）。** 売建ての暗号資産貸付料も支払い。部分決済のときに積み上がった利息を按分するかは書かれていない（平均法からの推定で按分する） |
| #PM-4 | 評価価格 | **未確定。** ルールも書面も「評価時の価格」としか書いていない |

### 2.4 このリポの税務調査で実測済みのこと

`docs/dev/tax-roadmap.md`（信用の実機検証）と `docs/dev/tax-evidence/ANSWERS.md` §4 に、
実口座で信用の建玉を作って全レコードを検算一致まで解読した結果が残っている。
計画の初版ではこれを拾えておらず、#PM-3 を未確定としていた。

- **利息**: 0.04%/日を **JST 0 時の時点で持っている建玉**に掛ける。建てた直後は 0、0 時をまたぐと 1 日分、
  24h 経っても 0 時をまたがなければ増えない。`interest = product × 0.0004 × またいだ 0 時の回数` が原精度で成立。
  「公式の信用取引ルールと一致」と記録されている。実測は 1 日超保有・0 時を 1 回またいだロングの 1 件で、
  複数回またぎは同じ式の外挿。2025-06-30 までは利息 0 円キャンペーンだった
- **手数料**: 建て時は `fee_amount_quote: 0` で、発生額は `fee_occurred_amount_quote` にだけ記録され、
  建玉の `unrealized_fee_amount` に積み上がる。決済時に「建て分 + 決済分」を決済行の `fee_amount_quote` で一括精算
  （実測で一致）。姉妹リポの実口座確認とも一致する
- **`profit_loss`**: `値幅損益 − 決済行の fee_amount_quote − interest` が原精度で完全一致。
  手数料・利息を引いた後のネット値（`close.ts` の前提と一致）
- **端数**: 約定の手数料系は 4 桁で四捨五入、`profit_loss` / `interest` は原精度、positions は 3 桁表示。
  姉妹リポの実口座でも約定の手数料・損益は円未満まで計上される（例: 損益 −12.8929 円）。
  完全精度で計算すれば恒等式は誤差ゼロで、丸めた手数料を使うと見かけの差が出る

### 2.5 姉妹リポ（bitbank-lab-mcp）への問い合わせ結果（2026-11-24）

姉妹リポの信用は「API の値を取得して表示する」だけで、追証・ロスカット・保証金率・利息を自前で計算するコードは無い。
根拠は公式 docs のミラーと実口座での数点の確認で、ルールページや契約締結前交付書面を根拠にした記述は無い。
新しく分かったのは次の点:

- **docs が定める丸め規則**（`margin-status` の各値）。paper の出力をこれに合わせられる:

  | フィールド | 丸め |
  |---|---|
  | `total_margin_balance_percentage` | 切り捨て 2 桁 |
  | `total_margin_balance` | 切り捨て 4 桁 |
  | `margin_position_profit_loss` | −∞ 方向に 4 桁 |
  | `unrealized_cost` | +∞ 方向に 4 桁 |
  | 維持必要保証金・約定時必要保証金 | 切り上げ 4 桁 |
  | 追加保証金率・強制決済率 | 切り上げ 0 桁 |

- `stop_margin_long_order` / `stop_margin_short_order` は新規建て（buy × long / sell × short）だけを止め、
  返済は止めない扱い（本計画 §3.4 と同じ）
- `losscut` は約定履歴の `type` に現れることがある（docs）。paper のロスカット決済を `type: "losscut"` の約定として
  記録すると、本番の約定履歴と形が揃う
- 「最大レバレッジ 2 倍」「保証金率が閾値を下回ると自動決済」など、姉妹リポにある説明文の一部は出典が無い。
  本計画の根拠には使わない
- `margin_current_individual_ratio` を信用対応ペアの目印に使うのは、姉妹リポでも推測の扱い（#PM-0 は未確定のまま）

---

## 3. 設計判断（ADR-010 で確定する）

### 3.1 public のみの境界は変えない

| 案 | 内容 | 採否 |
|---|---|---|
| **A** | パラメータは `/spot/pairs` から引く。取れないものは仮定値として state に固定する | **採用** |
| B | 実口座の `margin-status` / `margin-positions`（private GET）からしきい値などを引く | 不採用 |

B を捨てる理由:

- paper の価値は「API キーなしで誰でも練習できる」こと（Skill の compatibility は「`.env` は不要」）。
  private を引くと信用審査済みのアカウントが要り、練習の入口として成り立たない
- 実口座の値が paper に混ざり、「どこまでが仮想か」が曖昧になる
- chaos `x09`（paper は `http-private*` / `auth` を import しない）を崩すことになる

### 3.2 コマンド形状 — 本番 Phase 7 と同じ語彙

```bash
bitbank paper create-margin-order --pair=btc_jpy --side=buy --position-side=long --type=market --amount=0.001
bitbank paper create-margin-order --pair=btc_jpy --side=sell --position-side=long --type=limit --price=16000000 --amount=0.001 --intent=close
bitbank paper margin-status
bitbank paper margin-positions [--pair=btc_jpy]
```

| 案 | 内容 | 採否 |
|---|---|---|
| **A** | `paper create-margin-order` を新設。`--position-side` 必須、`--intent` は任意のクロスチェック、結果に操作ラベル。`paper create-order` は `--position-side` を `PARAM` で拒否 | **採用** |
| B | `paper create-order` に `--position-side` を足す | 不採用 |
| C | `paper open-position` / `paper close-position` | 不採用 |

- **B を捨てる理由。** 本番の `trade create-order` は `--position-side` を拒否する（ADR-009 決定 1）。
  paper で B の形を練習すると、本番に移ったときにコマンド名が変わり、練習した手順がそのまま使えない
- **C を捨てる理由。** ADR-009 が案 C を捨てた理由（CLI が open / close を抽象化すると、
  API の `side` と表示がずれたときの責任が CLI に来る）は paper でも同じ
- **`--execute` / `--confirm` は持たない。** 実資金に触れないので、paper の既存方針（`reset` 以外は確認なし）に合わせる
- `paper cancel-order` / `active-orders` / `trade-history` は現物と共用する。
  本番でも取消は現物と信用で共通のエンドポイントなので、対応が取れる。
  信用の注文・約定には `positionSide` を付けて出す

本番との違いの一覧は §5。

### 3.3 口座と建玉のモデル

- **JPY 残高は現物と信用で共有する。** 本番の「現物口座の円が保証金」と同じ。
  現物の買いは**止めない**。本番も止めず、約定で受入保証金合計額が下がった結果として追証・強制決済の対象になるだけ
  （契約締結前交付書面「現物取引による買付けに係る未約定注文が約定された場合 … 受入保証金合計額の低下により …
  建玉が強制的に清算されることがあります」）。paper で止めると本番なら起きる強制決済を防いでしまい、
  ずれを強制決済が早く起きる側にだけ許す原則（ADR-010 決定 4）に反する。現物の約定の後にも強制決済を判定する
- **v1 の保証金は JPY 残高だけ**（代用暗号資産なし）。安全側に倒すため（§1 スコープ外）
- **建玉は `pair × position_side` で集約し、平均建値で持つ。** 本番の `margin-positions` と同じ粒度にする。
  **出力の**フィールド名は本番に合わせる: `open_amount` / `locked_amount` / `product` / `average_price` /
  `unrealized_fee_amount` / `unrealized_interest_amount`。state の中は paper の慣例どおり camelCase
  （`openAmount` / `product` / `unrealizedFee` / `unrealizedInterest`）で持ち、出力側で写す
- `locked_amount`（未約定の返済注文が予約している数量）は state に持たず、未約定注文から導く。
  現物の指値ロック（`computeLocked`）と同じ考え方で、取消・約定のたびに数字を合わせ直さずに済む
- 返済は平均建値で損益を確定し、未実現の手数料・利息を返済数量で按分して精算する。
  確定する損益は手数料・利息を引いた後のネット値で、本番 `trade-history` の `profit_loss` と同じ定義
  （`cli/tax/import/to-events-margin.ts` 冒頭。batch1 の検算で確認済み）。JPY 残高にはこの値だけを足す
- 両建て（同じペアのロングとショートを同時に持つ）は本番で可能なので、paper でも禁止しない

### 3.4 数値の出どころ — ライブ値・公表ルール・申告する仮定値

| 値 | 出どころ |
|---|---|
| 信用対応ペア | `/spot/pairs` の `margin_current_individual_ratio` が非 null（§2.2 で確定） |
| リスク想定比率（個人） | `/spot/pairs` の `margin_current_individual_ratio`。`until` を過ぎていたら `margin_next_individual_ratio` を使うか、pairs を取り直す |
| 新規建て・決済の手数料率 | `/spot/pairs` の `margin_open_*` / `margin_close_*`（成行 = taker、指値 = maker） |
| 利息率 | `/spot/pairs` の `margin_long_interest` / `margin_short_interest`（小数の日率。§2.4 で実測） |
| 利息の掛け方 | **実測（§2.4）+ 公表ルール（§2.3）。** JST 0 時をまたぐたびに `product × 日率`。売建ても暗号資産貸付料として `margin_short_interest` で支払う |
| 新規建て停止 | `/spot/pairs` の `stop_margin_long_order` / `stop_margin_short_order` |
| 追証・ロスカットの判定 | **公表ルール（§2.3）。** 追証は毎日 15 時（JST）に `B < Mm`、期限 24 時間。強制決済は随時 `B < Mm × 0.5`（強制決済掛け目） |
| 保証金率・必要保証金の算式 | **公表ルール（§2.3）** |
| 強制決済掛け目 | **公表ルール（0.5）。** API では private の `losscut_threshold` にしか無いので、ルールページの値を既定値として state に固定する |
| 評価価格 | **仮定**。v1 は ticker の last（現物 paper の成行と揃える。#PM-4） |
| 追証の解消判定 | **仮定**。差入方法に挙がった行為（返済・現物の売却）の直後に `B ≥ Mm` なら解消。価格の回復だけでは解消しない（保守側。§3.6） |

- 公表ルール由来の定数（強制決済掛け目・追証の基準時と期限）と仮定値は `paper init` のときに state へ書き込み、
  **信用の全出力に `assumptions` として載せる**（使ったリスク想定比率と `until`、強制決済掛け目、評価価格、
  保証金の範囲、各値の出典と確認日）。
  CLI のバージョンが上がって既定値が変わっても、既存の仮想口座の結果がこっそり変わらないようにする
- v3 の state を v4 に移行するときは、移行時点の既定値を書き込む
- 本番の値と一致する保証は無い。そのことを出力・Skill・runbook で明示する

paper が使う算式（記号は ADR-010 と共通。§2.3 の公表ルールどおり。`[#PM-4]` だけが仮定）:

```text
P  = Σ open_amount × average_price                 # 建玉（保有分）。建値基準
U  = Σ long:  (price − average_price) × open_amount
     Σ short: (average_price − price) × open_amount # 建玉評価損益（price は評価時の価格 [#PM-4]）
C  = Σ unrealized_fee_amount + unrealized_interest_amount   # 未収費用（不足金は負の JPY 残高として D に入る）
D  = JPY 残高                                       # 差入保証金（v1 は保証金現金だけ。代用暗号資産なし）
B  = D + U − C                                      # 受入保証金合計額
Mm = Σ open_amount × average_price × r              # 維持必要保証金額（r はペアごとのリスク想定比率）
Mo = Σ 未約定の新規建て指値 amount × 指値価格 × r     # 約定時必要保証金額（paper の成行は即時約定なので発注中に残らない）
保証金率 = B / P
新規建て: B ≥ Mm + Mo + 新規注文金額 × r            # 成行の新規注文金額は数量 × 評価時の価格
追証:     毎日 15:00 JST に B < Mm → CALL（期限 24 時間）
強制決済: 随時 B < Mm × 0.5、または CALL が期限までに解消しない
```

### 3.5 ロスカット判定 — 保守側に倒し、見えない区間は申告する

- tick のたびに、前回 tick 以降の 1m 足を時系列に走査する。各分で、建玉に**不利な極値**
  （ロングは low、ショートは high。両建てのペアは両方を試して低いほうの保証金率）で保証金率を評価する
- 複数ペアに建玉があるときは、各ペアの足を timestamp で揃え、口座全体で評価する
- `B < Mm × 0.5` になったら、全建玉をその足の不利な極値で決済し、未約定の新規建て注文を取り消す（本番どおり。§2.3）。
  返済注文は建玉が消えるので一緒に取り消す。極値で約定させるのは、急変時に成行の強制決済が滑る分を見込むため
- **同じ足の中の順序**（実装: `scan-step.ts`）。足の中で何が先に起きたかは分からないので、強制決済が早く起きる順にする。
  新規建ての約定 → 強制決済の判定 → 返済の約定。新規建てで増えた建玉はその足の不利な極値で評価し、
  返済の指値はその足で強制決済が起きたら約定させずに取り消す
- **足の無い時刻**（JST 15 時・追証の期限）は直前の足の終値で判定する。窓の頭でまだ足が出ていないペアは最初の足の始値を使う。
  建玉か注文のあるペアに足が 1 本も無ければ失敗させ、黙って判定を飛ばさない（`scan-prices.ts`）
- **現物の約定との前後**は v1 では扱わない。現物の指値（`cli/paper-fill.ts`）と信用の走査はそれぞれ時刻順に処理し、
  ペアをまたいだ現物と信用の約定の前後関係は再現しない（Step 5 で、現物の約定を先に反映してから信用を走査する）
- **建玉がある間は、`openOrders` が空でも tick で足を取りに行く。** 現行の `runTick` は
  `openOrders` が空なら早期 return するので、条件を広げる
- **lazy tick の 24h 上限を超えた区間。** 現物の指値は「24h に制限して警告」で済ませている。
  信用でロスカットを見逃すのは間違いが静かなので、24h を超える区間は年単位ファイルで取れる 4hour 足で判定する。
  そのうえで `warnings` と結果の `approximate: true` で申告する。足の取得に失敗した区間は
  信用の走査済み時刻（`margin.lastScanAt`。現物の `lastTickAt` とは別）を進めず、次の tick で取り直す
- 粗い足や極値での判定は、本番より早くロスカットさせる方向にずれる。paper で生き残った戦略が
  本番でロスカットされるのが最悪の失敗なので、ずれは安全側にだけ許す

### 3.6 追証・不足金

- **追証。** tick の走査で JST 15:00 をまたいだら、その時点の `B < Mm` を判定し、成り立てば `status: "CALL"` にして
  期限（基準時 + 24 時間）と追証額（`Mm − B`）を記録する。CALL の間は新規建てを拒否し、返済は許す
- **追証の解消。** 本番の差入方法のうち paper で行えるのは ③現物の売却と ④建玉の返済だけ（入金・預入は無い）。
  そのどちらかの直後に `B ≥ Mm` なら解消する。価格の回復だけでは解消しない。本番がどう扱うかは書かれていないので、
  強制決済が早く起きる側に倒す（ADR-010 決定 4）。現物の売却として数えるのは、追証の基準時より後の JPY 建ての売りだけ
  （JPY 以外のペアの売りは JPY が増えない）。成行の売り（`paper create-order`）は売った直後に現在値で、tick で約定した指値の売りは
  走査の中で約定した時刻に、その時点の口座で判定する（`paper-margin/spot-sale.ts`・`scan-actions.ts`）。売りは現物の約定履歴から
  拾うので、信用の走査に失敗した tick で約定した分も次の走査で数える。成行の判定は信用の状態が now まで走査済みで期限前のときだけで、
  その場で判定できなかった成行の売りも次の走査が売った時刻で判定する。現物の足だけ取れずに信用の走査が先へ進んだ後で約定が確定した
  売りは、`margin.pendingSpotSales` に残して、次に走査できた tick が窓の頭で判定する（判定が売りより遅れる近似）
- **期限到来。** 期限までに解消しなければ、期限の時刻で強制決済する（決済価格は §3.5 と同じく、その分の足の不利な極値）
- **ロスカット決済の記録。** 約定履歴に `type: "losscut"` として載せる（本番の約定履歴と同じ形。§2.5）
- **不足金。** 決済（強制決済・返済）の後に JPY 残高が負になったら、その額を `payables` に出し、`status: "DEBT"` にする。
  不足金がある間は新規建てを拒否し、返済は許す（損の大きい建玉の返済で負になり、含み益のある別の建玉が残る場合があるため。
  それを返済できないと口座が固まる）。paper には入金が無いので、建玉が無くなった後の解消手段は `paper reset` だけになる

### 3.7 出力と損益

- `paper margin-status` / `paper margin-positions` は、本番と**同じ意味で計算できるフィールドだけ**同名で出す。
  算式が分からないもの（`margin_call_percentage` / `losscut_percentage` / `losscut_threshold`）は出さない。
  代わりに `assumptions` に paper のしきい値を出す
- `paper pnl` の `perPair` / `total` は**現物だけのまま**にする。信用の履歴を混ぜると、
  `computePositions` が売り越しで落ちる。信用の実現・未実現損益は `margin` 節として別に足す。
  `total` の意味は変えない（既存の利用者を壊さない）
- 信用の約定は `paper trade-history` に `positionSide` と、返済時の `profitLoss` / `interest` を付けて載せる。
  本番の `trade-history` が `position_side` / `profit_loss` / `interest` を返すのに合わせる。
  state では現物の `history` と別の `margin.history` に持ち（§3.8）、コマンドの出力で時刻順にまとめる

### 3.8 数値・state・配置

- **数値は倍精度のまま**にし、`snapAmount` で誤差を潰す（`cli/paper-precision.ts`）。
  ADR-005 の厳密有理数は税務経路に限る（ADR-007 と同じ扱い）
- **state は v4 にする（実装済み）。** 現物の各フィールドは v3 のままで、`margin` を足す:
  - `margin.positions`（§3.3 のフィールド + `openedAt` / `lastInterestAt`）
  - `margin.orders`（未約定の信用の指値）と `margin.history`（信用の約定。本番 trade-history の信用行と同じ欄）
  - `margin.call`（発生中の追証）と `margin.assumptions`（公表ルール由来の定数・仮定・出典・固定した時刻）
  - 不足金は state に持たず、負の `balances.jpy` から導く

  **信用の注文と約定を現物の `openOrders` / `history` に混ぜない**（初版の計画からの変更）。
  現物のコードはそれらを全部現物として扱う: `computeLocked` は信用の買い指値に JPY、売り指値に base 通貨をロックし、
  `paper-fill.ts` は現物として約定させ、`computePositions` は信用の売りを売り越しとして拒否する。
  混ぜると全経路にガードが要り、1 つ漏れると静かに壊れる。別の配列なら現物のコードは無改修で済む。
  一覧を出すコマンド（`active-orders` / `trade-history`）でまとめて見せるのは Step 5

  v3 → v4 は空の配列と既定の仮定値で移行する。仮定値の `fixedAt` は state の `updatedAt` にする
  （読むだけのコマンドは書き戻さないので、移行時刻を使うと読むたびに値が変わる）。
  **v4 を書いた後に古い CLI に戻すと `Invalid paper state` で止まる**（ダウングレード不可。CHANGELOG に記載済み）
- **計算本体は `cli/paper-margin/` に置く。** 既存の例外（`cli/tax/` / `cli/portfolio/` / `cli/brief/`）と同じ形にする
  - chaos `x09` は `cli/commands/paper/` と `cli/paper-*.ts` しか見ていない。**新ディレクトリを検査範囲に足すのは必須。**
    足さないと「paper は private を叩かない」という検査が、新しいコードに効かない
  - `package.json` の `files` に `cli/paper-margin/` を足す（chaos `x22`）
- **`side × position_side → 操作ラベル / intent` の純関数は Phase 7 と共有する。**
  置き場所は中立な `cli/margin-operation.ts` にする。Phase 7 計画 §3.5 は `cli/commands/trade/margin-operation.ts` としているので、
  先に着手した側が中立の位置に作り、もう一方の計画書をそれに合わせる。
  paper から `cli/commands/trade/` を import する形は避ける

---

## 4. 実装ステップ

各ステップは独立した PR にできる粒度。順序は依存関係のとおり。

### Step 0: 仕様確認（メンテナ）

- ~~**#PM-0**~~ **確定（2026-11-24）**: 最新の `/spot/pairs` で確認（§2.2）。`margin-order-plan.md` §2 への注記は残作業
- ~~**#PM-1・#PM-2**~~ **確定（2026-11-24）**: 信用取引ルールと契約締結前交付書面の原文で確認（§2.3）。
  #PM-3 は税務調査の実測と公表ルールで確定（§2.4・§2.3）
- **#PM-4**（評価価格）は公表資料に定義が無い。v1 は ticker の last を仮定として申告する
- **#PM-5** 算式の突合（任意。公表ルールの検算として）。信用審査済みのアカウントで最小数量の建玉を持ち、
  `margin-status` の `total_margin_balance` / `total_margin_balance_percentage` と同時刻の ticker を記録する。
  同じ入力を §3.4 の算式に通し、差を記録する。#PM-4（評価価格）の手がかりにもなる
  （手作業。paper のコードは private を叩かない）
- 結果を ADR-010 に反映して `Accepted` にする

### Step 1: pairs の信用フィールドを通す

- `cli/commands/public/pairs.ts` の `PairSchema` に `margin_*`（nullable の numStr / number）と
  `stop_margin_long_order` / `stop_margin_short_order` を足す
- `cli/pairs-cache.ts` の `CachedPairSchema` を同様に拡張し、キャッシュの `version` を 2 に上げる
  （v1 のキャッシュは信用フィールドが無いので、読んだら取り直す）
- 比率は週次で切り替わる（`until`）。キャッシュの TTL（24h）とは別に、`until` を過ぎていたら
  `next` の値を使うか取り直すかを `cli/paper-margin/params.ts` で決める
  （実装: current の `until` までは current、過ぎたら next、next も過ぎたら `stale` を返して取り直させる）
- `defs-public-*.ts` の `pairs` output を更新し、`tool-catalog.json` を再生成する
- 現物 paper の挙動は変えない（既存テスト無変更で green）
- `cli/paper-margin/` を作るので、chaos `x09` の検査範囲と `package.json` の `files` もこの Step で足す（§3.8）
- キーの一覧と、Zod（API / キャッシュ）・JSON Schema（カタログ）の各表現での型は
  `cli/pair-margin-fields.ts` を単一ソースにする

### Step 2: `cli/margin-operation.ts`（Phase 7 と共有）

- `side × position_side → { label, intent }` の純関数と、`--intent` 不一致の判定
- Phase 7 が先に作っていたら、それを使う（実際は本フェーズが先に作った。
  `margin-order-plan.md` §3.5 を `cli/margin-operation.ts` に合わせて更新済み）

### Step 3: state v4

- `cli/paper-state.ts` は既に 243 行あるので、信用のスキーマは `cli/paper-margin/state.ts` に分ける
  （建玉のスキーマ `MarginPositionSchema` は Step 4 の建玉計算と一緒に先に作成済み）
- v1 / v2 / v3 → v4 の移行。仮定値の既定は `cli/paper-margin/assumptions.ts` を単一ソースにする
- **実装済み**: `cli/paper-margin/state.ts`（`MarginStateSchema` / `emptyMarginState`）、`assumptions.ts`、
  `history.ts`（約定履歴のスキーマと、走査のイベントからの変換）、`book.ts`（PaperState ⇔ MarginBook）。
  `paper init` は v4 を書く

### Step 4: 計算本体 `cli/paper-margin/`

| ファイル | 責務 |
|---|---|
| `params.ts` | pairs → ペアごとの信用パラメータ（比率・手数料率・利息率・停止フラグ） |
| `positions.ts` | 建玉の加算（平均建値）・評価損益（**実装済み**） |
| `close.ts` | 返済と精算（未実現の手数料・利息の按分、ネット損益の確定）（**実装済み**） |
| `closable.ts` | `locked_amount` の導出と返済可能数量の検査（本番の 50062 相当）（**実装済み**） |
| `account.ts` | §3.4 の P / U / C / D / B / Mm / Mo・保証金率・不足金（**実装済み**） |
| `conditions.ts` | 追証・強制決済の判定基準と強制決済掛け目の既定値（**実装済み**） |
| `new-open.ts` | 新規建ての可否（`B ≥ Mm + Mo + 注文金額 × r`）と新規建て可能額（**実装済み**） |
| `interest.ts` | JST 0 時をまたぐごとの利息の積み上げ（`product × 日率`。§2.4。JST の境界計算は `cli/date-utils.ts` の `jstDailyInstants`）（**実装済み**）。利息を積み残したまま建玉を変える操作は `positions.ts` / `close.ts` が拒否する |
| `losscut.ts` | 判定価格（ペアごとに安値・高値のうち評価損益が小さくなる方）と全建玉の決済（**実装済み**） |
| `margin-call.ts` | 追証の判定（JST 15 時）・期限切れ・解消（**実装済み**） |
| `fills.ts` | 信用の指値の約定（maker 手数料。新規建ては建玉に積み、返済は JPY に精算）（**実装済み**） |
| `scan.ts` / `scan-step.ts` / `scan-context.ts` / `scan-prices.ts` | 前回 tick からの時系列の処理。時刻は足・JST 15 時・追証の期限の和で、各時刻で 利息 → 新規建ての約定 → 追証判定 → 強制決済 → 返済の約定 の順（**実装済み**。§3.5 の補足） |

純関数で書き、I/O（ticker / candles / pairs の取得）は呼び出し側に置く。
現物の `cli/paper-fill.ts` と同じく、取得は lock の外、state の更新は `updateState` の中で行う。

### Step 5: コマンド

- **`paper create-margin-order`（実装済み）**: `cli/commands/paper/create-margin-order.ts`
  - params: `pair` / `side` / `position-side`（必須、`long|short`）/ `type`（`market|limit`）/ `amount` / `price` / `intent`（任意）
  - lock の外（`margin-order-input.ts` / `margin-order-prep.ts`）: 入力と操作ラベル、pairs による数量の検証、
    信用非対応ペアは PARAM（本番では 40167）、新規建て停止は新規建てだけを止める（買い新規 50083 / 売り新規 50081）、
    lazy tick、口座評価に要る全ペアの信用パラメータと現在値（ticker の last）
  - lock 内（`paper-margin/order-gate.ts` → `order.ts`）: 初期化済みか、信用の状態が最新か（建玉・注文の有無によらず、
    信用の走査済み時刻 `margin.lastScanAt` が now に届いていること）、不足金・追証（どちらも新規建てだけ）・新規建て可能額（50061）・
    返済可能数量（50062）を見てから、
    指値は `margin.orders` に積み（約定は lazy tick）、成行は last で約定させる（`market-fill.ts`。taker 手数料・円に丸めない）
  - 成行の返済で追証が解ければ解消し、結果の `marginCallResolved` で返す
  - 結果に `operation: { label, intent }` を載せる。口座の状態による拒否は一般のエラー（exit 1）、入力の誤りは PARAM（exit 4）
- **`paper margin-status` / `paper margin-positions`（実装済み）**: `cli/commands/paper/margin-status.ts` / `margin-positions.ts`
  （準備は `margin-view-prep.ts`、組み立ては `paper-margin/status.ts` / `positions-view.ts`）
  - 本番と同じ意味で計算できる欄は本番と同じ名前（snake_case）・同じ丸め（`paper-margin/rounding.ts`。保証金率は切り捨て 2 桁、
    維持必要保証金は切り上げ 4 桁など）。丸めの前に 3 桁下でそろえ、浮動小数の誤差が 1 単位として出ないようにする
  - `margin_call_percentage` / `losscut_percentage` / `losscut_threshold` は本番の値の意味・単位を実口座で確かめていないので同名では出さず、
    paper の判定しきい値を `thresholds`（追証は Mm / P、強制決済は Mm × 掛け目 / P。保証金率 %）に出す
  - paper だけの欄: `assumptions`（使ったリスク想定比率と until・評価価格・公表ルールの値と出典）、`stale`（直前の tick が now まで
    走査できなかった）、`margin_call`、建玉ごとの `current_price` / `unrealized_profit_loss`（本番の API は建玉ごとの評価損益を返さない）
  - `status` は NORMAL / CALL / DEBT。`available_balances` は信用対応の全ペアについての paper の見積り（B − Mm − Mo）/ r。
    追証・不足金の間と、新規建て停止中の向きは 0（`create-margin-order` が受け付けないので）
  - `last_scan_at` は信用の走査済み時刻（現物の `lastTickAt` とは別）
- **`paper create-order` の `--position-side`（実装済み）**: オプションとして登録せず、未知 flag のエラー（PARAM）に
  「信用は `paper create-margin-order`」の案内を添える（`cli/unknown-flags.ts` の `misplacedFlagHints`）。オプションとして
  登録して中で拒否すると、補完・help・agents カタログに使えない flag が載るため。Phase 7 の `trade create-order` にも同じ仕組みを使える
- **lazy tick への組み込み（実装済み）**: `cli/paper-fill.ts` の `runTick` が、現物の約定を反映した後に信用の走査を回す
  - 取得（足・pairs）は lock の外の `cli/paper-margin-tick.ts`、state の更新は lock 内の `cli/paper-margin/tick.ts`。
    pairs → 信用パラメータは `cli/paper-margin-pairs.ts`（比率が期限切れなら 1 度だけ取り直す）、4hour 足は `cli/paper-margin-candles.ts`
  - pairs から読めなくなったペア（取扱終了・欄の欠落・取り直しても期限切れ）は、最後に読めた値（state の `margin.lastParams`。
    `paper-margin/last-params.ts`）で走査・返済・表示を続け、`warnings` と `assumptions.riskRatios[].source: "last-known"` で申告する。
    そのペアの新規建ては止める。控えも無ければ従来どおり失敗する
  - 信用の建玉・注文があれば、現物の未約定注文が無くても足を取りに行く。現物だけの口座では信用のために何も取らない
  - 信用の走査は現物の `lastTickAt` とは別の走査済み時刻（`margin.lastScanAt`）から now まで。走査できたとき（または信用の
    建玉・注文が無く、走査するものが無いとき）だけ now へ進め、一度書いたら戻さない。現物の足の取得失敗では止めない
  - 前回の走査から 24h 以内は 1min 足、超えたら窓全体を 4hour 足で見て `approximate` と警告を出す（現物の 24h 打ち切りはそのまま）
  - 足は前回の走査を足の区切りに揃えた時刻から拾う（前回の時点で未確定だった足や 4hour 足を見落とさない）。
    直前の終値を持たせるため、さらに 1 区切りより前から取る。1min 足は窓にかかる UTC 日付をすべて取る（窓は 25h 近くになり、
    3 日にまたがることがある）。lock 内では、fresh な state の走査済み時刻で足の始点を揃え直す（lock の外で取った後に別の tick が
    進めた区間を 2 度走査しない）
  - 取得・パラメータ解決・走査に失敗したとき、peek の後に信用の建玉・注文が増えていて準備が無いとき、`--pair` の部分 tick では
    信用を走査せず走査済み時刻を進めない（次の tick でやり直す）
  - 窓の中で約定した現物（約定履歴から拾う）の JPY は約定時刻から評価に入れる（売りの代金を売る前の判定に使わない）。
    追証の基準時より後に JPY 建ての指値の売りが約定していれば、その時刻の口座で解消を判定する
  - 足の途中の時刻（4hour 足での JST 15 時など）は、その足の安値・高値で評価する（終値はその時刻より後の価格）。
    窓の終わり（now）も 1 時刻として処理し、最後の足より後に積んだ利息で強制決済の基準を割っていないかを見る
  - lock を取る前に別の tick が now 以降まで走査を済ませていれば、信用の走査を回さない（同じ足を、後から建った建玉で評価し直さない）。
    同じ理由で、注文・成行の約定の時刻は走査済み時刻より前にしない
  - 強制決済の出来事には、取り消した信用の注文の id（`canceled`）を載せる
  - `paper tick` の出力に `margin`（約定・強制決済の決済の履歴行、追証・強制決済の出来事、`approximate`）を足した
- **`paper cancel-order` / `paper active-orders`（実装済み）**: `cancel-order` は id で現物の指値を探し、無ければ信用の指値を取り消す
  （返済注文の予約数量・新規建て注文の約定時必要保証金は導出なので、注文を消すだけで解放される）。lazy tick が先に約定させた注文は
  現物と同じく「already filled」になる。`active-orders` は現物と信用の未約定注文を作成順にまとめ、信用の注文だけに `positionSide` を付ける
  （混在時は表の列が出るよう、現物の行にもキーを undefined で持たせる。JSON には出ない）
- **`paper pnl`（実装済み）**: `perPair` / `total` は現物だけのまま、信用の建玉・約定があるときだけ `margin` 欄を足す
  （`paper-margin/pnl.ts`）。行は pair × position_side で、実現損益は約定履歴の profitLoss の合計、未実現損益は値幅から
  未精算の手数料・利息を引いたもの（現物の行が買いの手数料を avgCost に含めるのと同じく、ここまでの費用を差し引く）。
  表と CSV は現物の行の後に信用の行（`btc_jpy long (margin)`）と MARGIN TOTAL を続ける。合計は丸める前の値で足す
- **`paper trade-history`（実装済み）**: 現物と信用の約定を時刻順にまとめる（信用の約定が無ければ従来どおり）。
  混在時は表で全部の列が出るよう、各行に全部のキーを同じ順で持たせる（JSON では無い欄は出ない）
- **`paper assets`（変更しない。計画からの変更）**: 信用の必要保証金を locked に含めない。`available` は現物の注文が実際に使える額
  （現物の発注チェックと同じ `computeLocked`）で、本番も現物の取引を信用の必要保証金で止めない（§3.3）。差し引くと表示と
  現物の注文の可否が食い違う。信用の必要保証金と新規建て可能額は `paper margin-status` で見る

### Step 6: 登録とカタログ

- `cli/commands/paper-handlers.ts` に登録し、`cli/commands/schema/defs-paper.ts` に params / output を足す
- `npx tsx scripts/gen-agents-catalog.ts` で `agents/` を再生成する（paper なので `dangerous` は付かない）

### Step 7: テスト

- `cli/__tests__/paper/margin/`:
  - ロング・ショートの新規建て → 返済で、損益・手数料・利息の精算が合う
  - 4 組合せの操作ラベル、`--intent` 不一致の拒否
  - 信用非対応ペア・停止フラグ・保証金不足・返済超過・`CALL` / `DEBT` 中の拒否
  - ロスカット: 単一ペア、複数ペアの同時刻評価、両建て、極値での約定、未約定注文の取消
  - 24h を超えるギャップで 4hour 足に切り替わり、`approximate` と `warnings` が出る
  - 足の取得に失敗したら信用の走査済み時刻（`margin.lastScanAt`）を進めない
  - 利息の日付境界（ホスト TZ に依存しないこと。chaos `x13` と同じく TZ を変えて同じ結果）
  - 現物の買いは止めず、その約定で保証金が割れたら強制決済の判定に掛かる
  - `paper pnl` の `perPair` / `total` が信用の約定で変わらない
  - state v3 → v4 の移行
- chaos:
  - `x09` の検査範囲に `cli/paper-margin/` を足す（§3.8。Step 1 で実施済み）
  - `x22` は `package.json` の `files` 更新で通す（Step 1 で実施済み）
  - `x04`（各ファイル 100 行目安）、`x17`（catalog の drift）

### Step 8: ドキュメント（ADR-010 が Accepted になってから）

- `CLAUDE.md` の paper 例外節: 信用を足したこと、public のみの境界は不変、ADR-010 へのリンク
- `.claude/rules/commands.md` の paper 行
- `skills/paper-trade/SKILL.md`: トリガー（「仮想でショートして」「ペーパーで信用買い」）、
  実行フロー、Gotchas（「paper の保証金率は仮定値込み。本番は `margin-status` で確認」）
- `docs/botter-runbook.md` 段階 2: 信用の練習手順（`paper margin-status` で `assumptions` を確認してから建てる）
- `README.md` の paper 表、`CHANGELOG.md`（state v4 はダウングレード不可）

**実装済み（2026-11-24）**: 上の全項目に加え、`llms.txt` と `skills/_shared/references/cli-conventions.md` の paper 節、
README の Skill 節（paper-trade）も更新した。SKILL.md は「信用取引（ペーパー）」節（前提・Step M1〜M4・再現するルール）と
Gotchas を足し、新規建てと返済の取り違えを防ぐため `--intent` を必ず付ける手順にした。実口座の信用の発注は未対応
（Phase 7）である旨を Skill・runbook に明記した

---

## 5. 本番（Phase 7）との対応

| 項目 | 本番 `trade create-margin-order` | `paper create-margin-order` |
|---|---|---|
| 語彙 | `side × position_side` | 同じ |
| ガード | dry-run 既定、`--execute` + `--confirm=I-UNDERSTAND-CREATE-MARGIN-ORDER` | なし（仮想） |
| 操作ラベル | dry-run に出す | 結果に出す |
| `--intent` | 任意。不一致は `PARAM` | 同じ |
| 手数料 | dry-run では見積らない | ライブの信用手数料率で約定時に計算する（paper は約定をシミュレートするので） |
| 信用非対応ペア | API が 40167 で拒否 | `margin_*` が null なら CLI が拒否 |
| 返済超過 | API が 50062 で拒否 | CLI が同じ条件で拒否 |
| 新規建て停止 | API が 50081〜50084 で拒否 | `stop_margin_*_order` を見て CLI が拒否 |
| 新規建て可能額超過 | API が 50061 で拒否 | §3.4 の算式で CLI が拒否 |
| 状態の確認 | `margin-status` / `margin-positions`（private） | `paper margin-status` / `paper margin-positions`（`assumptions` 付き） |

---

## 6. リスクと未決事項

- **仮定値が本番とずれる。** `assumptions` を毎回出し、Skill と runbook で
  「本番の保証金率は `margin-status` で確認する」と案内する。#PM-5 の突合結果を ADR-010 に残す
- **paper の保証金率を本番の目安として使われる。** 数値が本番と同じ形で出るほど起こりやすい。
  フィールドを本番と同名にするのは同じ意味で計算できるものだけに絞る（§3.7）
- **粗い足・極値での判定は誤検知する。** 安全側（本番より早いロスカット）にずれる前提で受け入れ、`approximate` で申告する
- **利息の日付境界は JST 0 時、追証の基準時は毎日 JST 15 時（§2.3・§2.4 で確定）。** API キーの組み立てではなく
  取引所の暦の再現なので、税務の年分判定（`cli/date-utils.ts`）と同じく「JST は表示用のみ」の例外になる。
  ADR-010 決定 7 に記録した。
  CLAUDE.md への追記は ADR-010 が Accepted になってから
- **Phase 7 との順序。** 依存は `cli/margin-operation.ts` の共有だけで、どちらを先にやってもよい。
  Phase 7 は実機確認 #M-1〜#M-5 がメンテナのアカウント待ちなので、paper を先に進めても衝突しない
- **ADR-009 の前提（#PM-0）。** pairs で信用対応ペアを判定できると確定したら、Phase 7 の dry-run でも
  非対応ペアを事前に弾けるようになる。ADR-009 は書き換えず、計画書の注記か新しい ADR で扱う
