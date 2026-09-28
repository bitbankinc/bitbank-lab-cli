# ADR-009: 信用注文を trade create-margin-order として分離する

## ステータス

Accepted（2026-09-15）

## コンテキスト

Phase 7 で `bitbank trade` から信用（margin）の**新規建て（open）**と**返済（close）**を
出せるようにする（計画書: [`docs/dev/margin-order-plan.md`](../dev/margin-order-plan.md)）。
信用の読み取り（`margin-status` / `margin-positions`）は Phase 2 で実装済みで、発注だけが無い。

bitbank の `POST /user/spot/order` は**現物と信用で同じエンドポイント**であり、
`position_side`（`long` / `short`）の有無だけで信用かどうかが決まる。新規建て / 返済を
指定するパラメータは API に無く、`side × position_side` の組合せで決まる:

| 操作 | side | position_side |
|---|---|---|
| ロング新規建て | `buy` | `long` |
| ロング返済 | `sell` | `long` |
| ショート新規建て | `sell` | `short` |
| ショート返済 | `buy` | `short` |

判断が必要になった点:

1. **コマンド形状。** 既存の `trade create-order` に `--position-side` を足すだけで済ませるか、
   別サブコマンドにするか、open / close の 2 コマンドに抽象化するか
2. **open / close の可視化。** API 語彙（side + position_side）を通す場合、
   「返済のつもりで新規建て」を利用者（LLM を含む）が承認前に気づける形にできるか
3. **手数料見積り。** 現物の dry-run が出す手数料見積り（`resolveDryRunFee`）を信用でも出すか
4. **dry-run で private GET を叩くか。** `margin-status` の `available_balances` を引いて
   新規建て可能額と突き合わせる案の採否

実機確認済みの事実（2026-09-15、計画書 §2）:

- `GET /spot/pairs` に信用対応フラグは無い。信用対応ペアの唯一の情報源は
  `margin-status` の `available_balances[].pair`
- **#M-6: 建玉が無い状態で返済方向（`sell × long` / `buy × short`）を出すと、API は
  50062（`Exceeds total margin position`）で拒否する。逆方向の新規建てには化けない**

## 決定

1. **別サブコマンド `trade create-margin-order` を新設する**（計画書 §3.1 案 B）。
   `--position-side` を必須にし、承認フレーズは現物と別の
   `I-UNDERSTAND-CREATE-MARGIN-ORDER` とする（`CONFIRM_PHRASES` に追加）。
   現物の `trade create-order` は `--position-side` を受け取ったら `PARAM` エラーで拒否し、
   「信用は `trade create-margin-order` を使ってください」と案内する。
2. **dry-run に、`side × position_side` から導いた操作ラベルを出す**（§3.2）。
   例: `操作: ロング返済（sell × long）`。`--machine` の envelope にも
   `operation: { label, intent: "open" | "close" }` として載せる。
   任意フラグ `--intent=open|close` を受け付け、導出結果と食い違ったら `PARAM` で止める。
   API には送らない CLI 側だけのクロスチェックで、**必須にはしない**。
3. **信用の dry-run では手数料見積りを出さない**（§3.3）。`fee` は付けず、
   「信用の手数料・金利は見積りに含まない。`margin-status` / `margin-positions` で確認」と
   note を出す。
4. **dry-run で private GET を叩かない**（§3.4）。現物と同じ「public GET 1 回・private / POST
   不可」の境界を信用でも守る。事前確認は runbook 側で
   「`margin-status` → dry-run → 本番」の手順として書く。

操作ラベルの導出（決定 2）は、API が受け取る `side` と `position_side` の組合せを
公式 docs の対応表どおりに表示語へ写すだけであり、**分析ではなく API 語彙の表示変換**である。
[ADR-002](002-no-analysis-logic-in-cli.md)（CLI に分析ロジックを持たない）の例外は作らない。

## 理由

### なぜ別サブコマンドか（案 A / C を捨てた理由）

| 案 | 内容 | 判定 |
|---|---|---|
| A | `trade create-order` に `--position-side` を足すだけ | 却下 |
| **B** | `trade create-margin-order` を新設。`--position-side` 必須。現物は `--position-side` を拒否 | **採用** |
| C | `trade open-position` / `trade close-position` の 2 コマンドで side を導出 | 却下 |

- **案 A を捨てた理由。** 信用は損失が証拠金を超え得る、現物とはリスク区分の違う操作。
  二段ロック（[`trading-safety.md`](../../.claude/rules/trading-safety.md)）の設計思想は、
  コマンドごとに固定フレーズを分けることで「何をしようとしているか」を承認文言に埋め込むもの。
  現物と同じ `I-UNDERSTAND-CREATE-ORDER` で信用が通るのは、この設計を弱める。
  また `agents/tool-catalog.json` の `dangerous` / `confirm` はコマンド単位なので、
  A だと LLM が「create-order は現物」と読んだまま信用を出せてしまう。B なら
  カタログに信用専用エントリが立ち、`confirm` フレーズも別になる。
  監査ログ（`trade-log`）でも `command` 名で信用か現物かを一目で判別できる
- **案 C を捨てた理由。** open / close を CLI が抽象化すると、API の `side` と表示がズレたときの
  責任が CLI 側に来る（「返済のつもりで新規建て」が CLI のバグで起こり得る）。
  bitbank の語彙（side + position_side）をそのまま通す B の方が薄い層に留まる
  （[ADR-001](001-cli-vs-mcp-separation.md)）

### なぜ操作ラベルは「出す」が `--intent` は「任意」か

案 C を捨てる代わりに、承認前に意図を可視化する手段として dry-run にラベルを出す。
`--intent` は LLM やスクリプトが `side` を取り違える事故を承認前に落とすための保険だが、
**#M-6 で API 側が建玉なしの返済方向を 50062 で拒否することを確認済み**なので、
「返済のつもりで新規建て」は API 側で構造的に防がれている。したがって `--intent` は
「事故防止」ではなく「承認前に意図を可視化する補助」の位置づけで足り、必須にして
bitbank の語彙だけで書ける状態を崩す必要は無い。

### なぜ手数料見積りを出さないか

`resolveDryRunFee` は `/spot/pairs` の現物 maker / taker レートを前提にしている。
信用は建玉手数料・金利が別体系で、`margin-positions` の `unrealized_fee_amount` /
`unrealized_interest_amount` として事後に現れる。現物のレートを流用して誤った数字を
出すより、見積りに含まないことを note で明示する方が安全。

### なぜ dry-run で private GET を叩かないか

`margin-status` を引いて新規建て可能額と突き合わせる案は魅力的だが、dry-run が認証を
要求するようになる変更で、**read-only profile でのドライラン練習**
（[`botter-runbook.md`](../botter-runbook.md) 段階 3）を壊す。非対応ペアも `pairs` に
フラグが無いため CLI 側で事前に弾けず、API の 40167 に任せる。

## 影響

- `cli/commands/trade/create-margin-order.ts` を新設し、`create-order.ts` から
  body 組立と type 別 refine を `order-body.ts` に、`side × position_side → ラベル / intent` の
  純関数を `margin-operation.ts` に切り出す（計画書 §3.5）。`refineExecuteConfirm()` の呼び出しは
  各コマンドファイルに残す（chaos `x10b` がファイル単位で検査する）
- `cli/types.ts` の `DryRunData` に optional の `operation?` を足す（`fee` と同じく optional
  なので他コマンドは無改修）
- **後続作業（本 ADR の決定に伴い更新が必要なもの）:**
  - [`trading-safety.md`](../../.claude/rules/trading-safety.md) のフレーズ表に
    `trade create-margin-order` → `I-UNDERSTAND-CREATE-MARGIN-ORDER` を追加し、
    「信用の dry-run は手数料見積りを出さない」を追記する
  - `agents/tool-catalog.json` を再生成し、`dangerous: true` /
    `confirm: I-UNDERSTAND-CREATE-MARGIN-ORDER` の信用専用エントリを載せる
  - chaos `x10-confirm-guards.test.ts` の「`CONFIRM_PHRASES` covers exactly the 5 trade commands」
    を 6 に更新する
  - 信用関連のエラーコード（40164 / 40167 / 50058〜50062 / 50081〜50084 / 60019）を
    `cli/error-codes.ts` に登録し、`agents/error-catalog.json` を再生成する。
    `apiErrorExitCode` は 40164 / 40167 だけを個別に `PARAM` にし、既存の範囲分岐は広げない
- **スコープ外のまま残るもの:** `take_profit` / `stop_loss` / `losscut` 注文タイプ
  （`PARAM` で明示的に拒否）、`paper` での信用シミュレーション、返済数量の自動解決
  （建玉から数量を埋める機能。private GET を発注経路に持ち込む判断が要るので需要を見て別途）、
  信用の手数料・金利の見積り
- `trade cancel-order(s)` は現物・信用共通の `/user/spot/cancel_order` を叩くため、
  追加実装なしで信用注文も取り消せる想定（実機確認 #M-4 で確定させる）
