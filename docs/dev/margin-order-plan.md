# 信用取引の新規建て・返済注文 — 開発計画

> Phase 7 の計画書。`trade` カテゴリに信用（margin）注文を追加するための
> スコープ・設計判断・実装ステップ・検証手順をまとめる。
> 進捗チェックリストは [`phases.md`](phases.md) の Phase 7、
> 設計判断の確定版は着手時に ADR-009 として起票する（本書は計画であって ADR ではない）。

---

## 1. 現状と目的

### 現状（2026-09 時点）

| 領域 | 状態 |
|---|---|
| 信用の**読み取り** | `margin-status` / `margin-positions` が実装済み（Phase 2）。`order` / `active-orders` / `trade-history` も `position_side` を露出済み |
| 信用の**発注** | 未実装。`trade create-order` は現物専用で `position_side` を受け付けない |
| 信用の**キャンセル** | `trade cancel-order(s)` は現物・信用共通の `/user/spot/cancel_order` を叩くため、追加実装なしで信用注文も取り消せる（要実機確認 #M-4） |
| 信用の**税務** | `tax verify-report --margin-csv` で年間取引報告書（信用）と突合可能 |

### 目的

`bitbank trade` から信用の**新規建て（open）**と**返済（close）**を、現物と同じ
「ドライラン既定 → `--execute` + `--confirm=<phrase>` の二段ロック」で出せるようにする。

### スコープ外（本フェーズでやらないこと）

- `take_profit` / `stop_loss` / `losscut` 注文タイプ。公式 docs に挙動の記述がなく、
  `losscut` はシステム起動。姉妹リポ bitbank-lab-mcp も同じ理由で不採用にしている。
  受け取ったら `EXIT.PARAM` で明示的に拒否する
- `paper` での信用シミュレーション（証拠金・金利・ロスカットのモデルが必要で、
  ADR-003 の paper の前提「public ticker × 仮想資金」を超える。別フェーズ）
- 返済注文の**自動数量解決**（「ロング全部返済」のように数量を省略して建玉から
  埋める機能）。private GET を発注経路に持ち込む設計判断が要るので、まず
  明示指定のみで出し、需要を見て Phase 7.5 として検討する
- 信用の手数料・金利の**見積り**（現物の `resolveDryRunFee` は `/spot/pairs` の
  現物レートを使う。信用は別体系なので流用すると誤った数字を出す）

---

## 2. API 仕様の確認結果

公式 [rest-api.md](https://github.com/bitbankinc/bitbank-api-docs/blob/master/rest-api.md)
「Create new order」（`POST /user/spot/order`）:

| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| pair | string | YES | pair enum |
| amount | string | NO | required if type is other than `take_profit`, `stop_loss` |
| price | string | NO | price |
| side | string | YES | `buy` or `sell` |
| position_side | string | NO | `long` or `short` |
| type | string | YES | `limit`, `market`, `stop`, `stop_limit`, `take_profit`, `stop_loss`, `losscut` |
| post_only | boolean | NO | `limit` のときのみ `true` 可 |
| trigger_price | string | NO | trigger price |

- **信用と現物は同じエンドポイント**。`position_side` の有無で信用か現物かが決まる
- 新規建て / 返済は `side × position_side` の組合せで決まる（API に open/close の
  パラメータは無い）:

| 操作 | side | position_side |
|---|---|---|
| ロング新規建て | `buy` | `long` |
| ロング返済 | `sell` | `long` |
| ショート新規建て | `sell` | `short` |
| ショート返済 | `buy` | `short` |

- 返済注文は約定まで建玉の `locked_amount`（アクティブな返済注文の `remaining_amount` 合計）
  として `margin-positions` に現れる。返済可能数量は `open_amount - locked_amount`
- **既存 CLI の `margin-positions` には 2 つの前提バグがある**（本フェーズの前提修正、Step 1.5）:
  - `PositionSchema` に `locked_amount` が無く、Zod が未知キーを落とすため出力に現れない。
    返済可能数量を利用者が判定できないので、フィールドを足す
  - `--pair` を API に渡しているが、公式仕様では `GET /user/margin/positions` は
    パラメータ無し（全ペア返却）。`--pair` は CLI 側のフィルタに変える
- レスポンスは現物と同じ形で `position_side` が付く（`OrderSchema` は既に optional で受けている）

### 関連エラーコード（[errors.md](https://github.com/bitbankinc/bitbank-api-docs/blob/master/errors.md)）

| code | 内容 | CLI での扱い |
|---|---|---|
| 40164 | `position_side` が不正 | `PARAM`（`apiErrorExitCode` の 30001〜40001 範囲外なので分岐追加が要る。CLI 側の Zod enum で先に弾くため通常は到達しない） |
| 40167 | 信用取引に対応していないペア | `PARAM` 相当だが同上の理由で分岐追加。`margin-status` の `available_balances` に載るペアだけが対象である旨を案内 |
| 50058 | 信用取引の審査が未完了 | `AUTH` ではなく `GENERAL`。メッセージで「bitbank で信用取引の申込・審査が必要」と案内 |
| 50059 / 50060 | 新規建ての一時制限 | retry 可（時間を置く） |
| 50061 | 新規建て可能額超過 | `margin-status` の `available_balances[pair].long/short` を見るよう案内 |
| 50062 | 建玉超過（`Exceeds total margin position`）。**建玉が無い / 足りない状態で返済方向を出すとこれが返る**（#M-6 で実機確認） | 「返済数量が返済可能数量（`open_amount - locked_amount`）を超えている。`margin-positions` で確認」と案内。`locked_amount` は未約定の返済注文が予約している数量なので、`open_amount` だけでは判定できない。逆方向の新規建てには**ならない** |
| 50081〜50084 | 信用 売り新規 / 売り返済 / 買い新規 / 買い返済 が停止中 | retry 不可。方向別の停止であることをメッセージに出す |
| 60019 | TakeProfit / StopLoss の side が返済方向でない | 本フェーズは該当タイプを拒否するので到達しない想定 |

いずれも `cli/error-codes.ts` に未登録。`agents/error-catalog.json` の再生成対象。
`apiErrorExitCode` は 30001〜40001 だけを `PARAM` にしているので、40164 / 40167 を
`PARAM` にするなら範囲を広げるのではなく**個別コードで**足す（40xxx 全体を `PARAM` に
すると出金系の 401xx も巻き込む）。

### 実機確認済み（2026-09-15）

- `GET /spot/pairs` に信用対応フラグは**無い**（`is_enabled` / `stop_order` /
  `stop_order_and_cancel` のみ）。信用対応ペアの唯一の情報源は `margin-status` の
  `available_balances[].pair`（確認時点で btc / eth / xrp / doge / sol の 5 ペア）
- したがって非対応ペアは CLI 側で事前に弾けず、API の 40167 に任せる。dry-run は
  private を叩かない方針（3.4）なので、runbook で「`margin-status` で対象ペアを確認
  してから」と案内する
- **#M-6: 建玉なしで返済方向を出すと API は 50062 で拒否する**（`sell×long` /
  `buy×short` の両方、btc_jpy・0.0001・約定しない価格で確認。
  `scripts/dev/margin-probe-m6.ts`）。逆方向の新規建てに化けることは無いので、
  「返済のつもりで新規建て」は API 側で構造的に防がれている。`--intent` は
  任意フラグのままでよい（3.2）
- 同時に、未登録コードは CLI が `API error: 50062` としか出せないことも確認。
  Step 1 のエラーコード登録が利用者向けの案内文に直結する

---

## 3. 設計判断（着手時に ADR-009 として確定する）

### 3.1 コマンド形状 — **別サブコマンド `trade create-margin-order` を推奨**

| 案 | 内容 | 採否 |
|---|---|---|
| A | `trade create-order` に `--position-side` を足すだけ | 不採用 |
| **B** | `trade create-margin-order` を新設。`--position-side` 必須。現物の `create-order` は `--position-side` を受けたら `PARAM` エラー | **採用** |
| C | `trade open-position` / `trade close-position` の 2 コマンドで side を導出 | 不採用 |

**B を採る理由**

- 信用は損失が証拠金を超え得る、現物とはリスク区分の違う操作。二段ロックの
  設計思想（`trading-safety.md`）はコマンドごとに固定フレーズを分けることで
  「何をしようとしているか」を承認文言に埋め込むもの。現物と同じ
  `I-UNDERSTAND-CREATE-ORDER` で信用が通るのは、この設計を弱める
- `agents/tool-catalog.json` の `dangerous` / `confirm` はコマンド単位。A だと
  LLM が「create-order は現物」と読んだまま信用を出せてしまう。B なら
  カタログに信用専用エントリが立ち、`confirm` フレーズも別になる
- C は open/close を CLI が抽象化するため、API の `side` と表示がズレたときの
  責任が CLI 側に来る（「返済のつもりで新規建て」が CLI のバグで起こり得る）。
  bitbank の語彙（side + position_side）をそのまま通す B の方が薄い層に留まる

**フレーズ**: `I-UNDERSTAND-CREATE-MARGIN-ORDER`（`CONFIRM_PHRASES` に追加）

### 3.2 open / close の可視化 — dry-run に**操作ラベル**を出す

C を捨てる代わりに、dry-run の表示と `--machine` の envelope に
`side × position_side` から導いたラベルを載せる:

```
🔍 DRY RUN（実際のAPIは叩きません）

操作: ロング返済（sell × long）
...
```

`DryRunData` に optional の `operation?: { label: string; intent: "open" | "close" }`
を足す（`fee` と同じく optional なので他コマンドは無改修）。

**任意フラグ `--intent=open|close`** を受け付け、導出結果と食い違ったら
`PARAM` エラーで止める。API には送らない、CLI 側だけのクロスチェック。
LLM やスクリプトが `side` を取り違える事故を、承認前に落とすための保険。
必須にはしない（bitbank の語彙だけで書けることを保つ）。#M-6 で API 側が
建玉なしの返済方向を 50062 で拒否することを確認済みなので、`--intent` は
「事故防止」ではなく「承認前に意図を可視化する補助」の位置づけになる。

### 3.3 手数料見積り — 信用では**出さない**

`resolveDryRunFee` は現物の maker/taker レートを前提にしている。信用は
建玉手数料・金利が別体系（`margin-positions` の `unrealized_fee_amount` /
`unrealized_interest_amount` として事後に現れる）。誤った数字を出すより、
dry-run に「信用の手数料・金利は見積りに含まない。`margin-status` /
`margin-positions` で確認」と note を出す。`fee` は付けない。

### 3.4 dry-run で private GET を叩くか — **叩かない**

現物の dry-run は「public GET 1 回・private/POST 不可」。信用でも同じ境界を守る。
`margin-status` の `available_balances` を引いて新規建て可能額と突き合わせる案は
魅力的だが、dry-run が認証を要求するようになる変更で、read-only profile での
ドライラン練習（runbook 段階 3）を壊す。事前確認は runbook 側で
「`margin-status` → dry-run → 本番」の手順として書く。

### 3.5 実装の共有 — body 組立と POST 経路は現物と共用

`create-order.ts` は既に 100 行超。信用を足すとさらに膨らむので、
共通部分を切り出す:

```
cli/commands/trade/
  create-order.ts          # 現物。position-side を受けたら PARAM
  create-margin-order.ts   # 信用。position-side 必須・intent クロスチェック
  order-body.ts            # 共通: 入力 Zod ベース + body 組立 + type 別 refine
  margin-operation.ts      # side × position_side → ラベル/intent の純関数
```

`order-body.ts` の Zod ベースを両コマンドが `.extend()` して使う。
`refineExecuteConfirm("<command>")` の呼び出しは各コマンドファイルに残す
（chaos `x10b` がファイル単位で grep する）。

---

## 4. 実装ステップ

各ステップは独立に PR にできる粒度。順序は依存関係順。

### Step 0: ADR-009 起票

- `docs/adr/009-margin-order-separate-command.md`（採番は着手時に `ls docs/adr/` で再確認）
- 3.1〜3.4 の判断と捨てた案を記録。`x21` を通す

### Step 1: エラーコード登録

- `cli/error-codes.ts` に 40164 / 40167 / 50058〜50062 / 50081〜50084 / 60019 を追加
- `apiErrorExitCode` は 40164 / 40167 だけを個別に `PARAM` へ。既存の範囲分岐は変えない（50xxx / 60019 は `GENERAL`）。
  retry 指針は `scripts/gen-agents-catalog.ts` 側のカテゴリ分類に従う
- `npx tsx scripts/gen-agents-catalog.ts` で `agents/error-catalog.json` を再生成
- `skills/_shared/references/error-catalog.md` に信用行を追記

### Step 1.5: `margin-positions` の前提修正

- `PositionSchema` に `locked_amount: numStr` を追加（fixture `__fixtures__/private/margin-positions.ts`
  も実 API 形状に合わせて更新。`x18` が fixture 経由を強制する）
- `--pair` は API に送らず CLI 側で `positions` を絞り込む（API はパラメータを受けない）
- `defs-private.ts` の output に `locked_amount` を足し、`tool-catalog.json` を再生成

### Step 2: 共通部の切り出し（挙動変更なし）

- `order-body.ts` / `margin-operation.ts` を新設し、`create-order.ts` を
  それに乗せ換える。**既存テスト（`create-order.test.ts`）を一切変えずに green** が完了条件
- `create-order.ts` に `positionSide` を受けたら `PARAM` で拒否する分岐を足す
  （「信用は `trade create-margin-order` を使ってください」）

### Step 3: `trade create-margin-order`

- `cli/commands/trade/create-margin-order.ts`
  - params: `pair` / `side` / `position-side`（必須, `long|short`）/ `type`
    （`limit|market|stop|stop_limit` のみ）/ `price` / `amount`（必須）/
    `trigger-price` / `post-only` / `intent`（任意）/ `execute` / `confirm`
  - `take_profit` / `stop_loss` / `losscut` は enum に入れず `PARAM`
  - dry-run: `operation` ラベルと信用 note。`fee` なし
  - execute: `privatePost("/user/spot/order", body)` → `OrderSchema`
- `confirm-guard.ts` の `CONFIRM_PHRASES` に `"create-margin-order"` を追加
- `trade-handlers.ts` に登録、`defs-trade.ts` に schema 追加
- `cli/types.ts` の `DryRunData` に `operation?` を追加、
  `output-dry-run.ts` で描画
- `npx tsx scripts/gen-agents-catalog.ts` → `tool-catalog.json` に
  `dangerous: true` / `confirm: I-UNDERSTAND-CREATE-MARGIN-ORDER` で載る

### Step 4: テスト

- `cli/__tests__/trade/create-margin-order.test.ts`
  - `--execute` なし → dryRun、fetch 未呼出
  - `--execute` 単独 / フレーズ不一致 / **現物フレーズ `I-UNDERSTAND-CREATE-ORDER`** → `PARAM`、fetch 未呼出
  - `position-side` 省略 → `PARAM`
  - `take_profit` 等 → `PARAM`
  - `--intent=close` で `buy × long` → `PARAM`（導出は open）
  - 4 組合せそれぞれのラベル・intent
  - body に `position_side` が入り、レスポンスの `position_side` がパースされる
  - 監査ログ（`trade-log`）に `params.positionSide` が残る
- `cli/__tests__/trade/create-order.test.ts` に「`positionSide` を渡すと `PARAM`」を追加
- `cli/__tests__/trade/margin-operation.test.ts`（純関数）
- chaos の更新:
  - `x10-confirm-guards.test.ts` の「`CONFIRM_PHRASES` covers exactly the 5 trade commands」を 6 に更新
  - `x06` / `x10b` は新ファイルを自動検出するので、`.execute` 参照と
    `refineExecuteConfirm("create-margin-order")` 呼び出しを直書きする
  - `x17` は catalog 再生成、`x04` は各ファイル 100 行目安（超えるなら冒頭コメント）

### Step 5: ドキュメント

- `.claude/rules/trading-safety.md`: フレーズ表に `trade create-margin-order` を追加、
  「信用の dry-run は手数料見積りを出さない」を追記
- `.claude/rules/commands.md`: trade 行に信用の注記
- `README.md` Trade 表に 1 行（例: `trade create-margin-order --pair=btc_jpy --side=buy --position-side=long --type=limit --price=9000000 --amount=0.001`）
- `docs/botter-runbook.md`: 段階 3 / 4 に信用の手順（`margin-status` で
  `available_balances` を見る → dry-run で操作ラベルを確認 → 本番。返済後は
  `margin-positions` で `locked_amount` / 建玉消滅を確認）
- `CHANGELOG.md`

### Step 6: 実機確認（メンテナ、信用審査済みアカウントで）

**前提**: 検証専用のアカウント（または他の bot・手動発注がすべて止まっている口座）で行う。
建玉確認と POST の間に同じペア・同方向の建玉が開くと、返済方向のテスト注文が本物の
返済注文になり `locked_amount` を予約する。直前の再確認では競合を防げないので、
「同時に注文を出す主体が無い」ことを運用で保証する。

phases.md の慣例に合わせ、番号付きで記録する:

- **#M-1** ロング新規建て（limit, 最小数量）→ `margin-positions` に建玉が出る
- **#M-2** ロング返済（sell × long）→ 約定前は `locked_amount`、約定後に建玉が消える
- **#M-3** ショート新規建て → 返済（#M-1/#M-2 の対称）
- **#M-4** 信用注文を `trade cancel-order` で取り消せる（追加実装不要の確認）
- **#M-5** 未審査アカウントで 50058 が `GENERAL` + 案内メッセージになる
- ~~**#M-6**~~ **確認済み（2026-09-15）**: 建玉なしの返済方向は 50062 で拒否される。
  逆方向の新規建てにはならない（§2「実機確認済み」）。#M-4 は注文が通らなかったため
  未確認のまま。#M-1 で建てた注文で確認する

---

## 5. 姉妹リポ bitbank-lab-mcp から取り入れるもの / 取り入れないもの

| 項目 | MCP 側 | 本 CLI での扱い |
|---|---|---|
| open/close の対応表（side × position_side） | `docs/private-api.md` に表として明記 | そのまま採用。dry-run ラベルの根拠 |
| `take_profit` / `stop_loss` / `losscut` の不採用 | 「挙動が undocumented」「losscut はシステム起動」で validation error | 同じ理由で同じ扱い |
| 未審査エラー 50058 の案内文 | 「信用取引には bitbank での申込・審査が必要」 | エラーメッセージに採用 |
| preview → HMAC トークン（60 秒・ワンタイム）の二段確認 | MCP の HITL 設計（ADR-0007） | **取り入れない**。CLI は dry-run → `--execute --confirm=<phrase>` が対応物。トークンは MCP がプロセス内で LLM から秘匿できるから成り立つ仕組みで、CLI では shell 履歴に残る flag 値と等価になる |
| `/spot/pairs` による事前バリデーション（最小数量・桁数） | preview で検査 | 現物の `create-order` にも無い。信用固有ではないので本フェーズのスコープ外（別 issue） |
| `get_margin_trade_history` | 信用の約定履歴を別ツール化 | 既存 `trade-history` が `position_side` / `profit_loss` を返すので不要 |

---

## 6. リスクと未決事項

- ~~#M-6 の結果次第で設計が変わる~~ → **確定**: 50062 で拒否されるため `--intent` は
  任意のまま。3.4 の例外（close 時の private GET）も不要
- ~~`pairs` API に信用対応ペアのフラグがあるか未確認~~ → **無いことを実機確認済み**
  （§2「実機確認済み」）。非対応ペアは API の 40167 に任せる
- 信用の `amount` 単位・桁数が現物 `/spot/pairs` の `unit_amount` /
  `amount_digits` と同じかは docs に記載がない。#M-1 で確認
- `trade-log` は `params` を丸ごと記録するので `positionSide` は自動で残るが、
  監査で「信用か現物か」を一目で判別できるよう `command` 名で分かれる
  （3.1 で B を採る副次的な利点）
