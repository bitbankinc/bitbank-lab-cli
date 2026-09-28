# エラー分類カタログ

bitbank CLI が返す `success: false` のエラーを skill が一貫して扱うための分類表。
コードと exit code の単一ソースは `cli/error-codes.ts` / `cli/exit-codes.ts`。
本ファイルはそれを skill 向けに「カテゴリ × ハンドリング方針」へ整理した
読み物。

## 前提

- skill は CLI の `success` フィールドを最初に見る（`cli-conventions.md` 参照）
- `success: false` のとき `exitCode` と、`error` 文字列の先頭が `<code>:` 形式
  （先頭の数値が API エラーコード。例: `"60001: 残高不足"`）であることを併用して
  カテゴリを判定する。envelope に `error.code` フィールドは無い
- **GET と POST で retry 戦略が違う**。`trade` サブコマンドは POST で、冪等性
  保護のため CLI 側で `retries: 0` 固定（`trading-safety.md` 参照）。
  skill 側でも自動再実行はしないこと

## retry 戦略の表記

各カテゴリに以下のラベルで方針を書く。「参考秒数」は人間の感覚値であり、
厳密に守る必要はないが、これより極端に短い間隔で叩かないこと。

| ラベル | 意味 | 参考秒数 |
|--------|------|---------|
| `no_retry` | 再試行しない。原因を直す or skill を中止 | — |
| `retry_after_short` | 短い待機後に 1 回だけ再試行 | 5〜15 秒 |
| `retry_after_medium` | 中程度の待機後に 1 回だけ再試行 | 30〜60 秒 |
| `retry_after_long` | 長めに待ってから再試行（メンテ等） | 5〜15 分 |
| `abort_and_verify` | 再実行せず、状態確認コマンドで実状況を確かめる | — |

## カテゴリ

### 1. auth — 認証エラー

- **API code**: 20001 / 20002 / 20003
- **exit code**: `EXIT.AUTH (2)`。HTTP 401 と private/trade の 403 もここに集約。
  ただし public（無認証）コマンドの 403 は鍵の失敗ではないため `EXIT.GENERAL (1)`
  に落ち、`error` に「IP/地域/ネットワーク制限の可能性」が付記される（鍵を疑わない）
- **GET / POST**: 共通
- **戦略**: `no_retry`
- **skill としての振る舞い**:
  - `.env` 未設定 / API キー間違い / 署名失敗が原因。再試行で直らない
  - ユーザーに `.env` を確認するよう案内し、skill を中止
  - private/trade カテゴリのコマンドは `.env` の API キーを環境変数に
    読み込んでから呼び出す必要がある（cli-conventions.md「認証」を参照）

### 2. rate_limit — レート制限

- **API code**: 10009、HTTP 429
- **exit code**: `EXIT.RATE_LIMIT (3)`
- **GET**: `retry_after_medium`（30〜60 秒）
- **POST (trade)**: `abort_and_verify`
  - POST は CLI が自動再送しない。注文が通っているか
    `bitbank active-orders` / `bitbank trade-history` で確認してから判断
- **skill としての振る舞い**:
  - 並列に CLI を叩いている skill は呼び出し本数を減らす
  - `Retry-After` ヘッダがあれば CLI 側 (`http-core.ts`) が尊重しているので、
    skill 側で短時間に何度もリトライしないこと

### 3. param — パラメータエラー

- **API code**: 30001〜40001（quantity / order-id / price / asset 未指定 等）、
  信用の 40164（`position_side` 不正）/ 40167（信用非対応ペア）
- **exit code**: `EXIT.PARAM (4)`
- **GET / POST**: 共通
- **戦略**: `no_retry`
- **skill としての振る舞い**:
  - 引数を直さないと永久に失敗する。リトライ禁止
  - CLI に渡した値（pair, asset, order-id, quantity, price）を見直す
  - **信用の 2 コードは `error` 先頭のコードで個別に案内する**（exit code だけでは
    「引数の見直し」で止まってしまい、正しい復旧手順に届かない）:
    - 40164（`position_side` 不正）: `long` / `short` 以外を渡している。CLI の Zod で
      先に弾かれるので通常は到達しない
    - 40167（信用非対応ペア）: `pairs` に信用フラグは無いので引数を眺めても分からない。
      `bitbank margin-status` の `available_balances[].pair` に載るペアだけが対象。
      そのペアが載っていなければ、ペアを変えるか skill を中止する

### 3b. state — 状態不一致（注文が見つからない 等）

- **API code**: 50009（注文が見つかりません）
- **exit code**: `EXIT.GENERAL (1)`（範囲ベースの分類から外れるため param ではなく
  general に落ちる。skill 側は `error` が `"50009:"` で始まるかで個別判定すること）
- **GET / POST**: 共通
- **戦略**: `no_retry`
- **skill としての振る舞い**:
  - 「指定 order-id が存在しない」。直前に取得した `active-orders` の結果が
    古い可能性 → 再取得してから判断
  - 注文照会は **pair × order_id の複合キー**（実機確認済み）。注文が存在しても
    pair が違えば 50009 が返る
  - 約定済み・キャンセル済み注文は **3 か月経過で 50009** になる（公式 docs の
    保持期間仕様）。古い注文の照会で 50009 が出ても異常とは限らない
  - 「注文が消えた」と結論づける前に、pair 指定が正しいか・保持期間（3 か月）を
    超えていないかの**両方**を確認する
  - 同じ id を即座に再送しない

### 4. balance — 残高不足

- **API code**: 60001
- **exit code**: `EXIT.GENERAL (1)`（現状の error-codes.ts では rate_limit/auth/param
  以外なので GENERAL に落ちる）
- **GET / POST**: 主に POST（trade create-order）で発生
- **戦略**: `no_retry`
- **skill としての振る舞い**:
  - `bitbank assets` で現残高を確認し、数量を縮小するか skill を中止
  - 自動で数量を再計算して再送するロジックは skill に書かない（trading-safety
    の精神）。ユーザーに状況を提示して判断を仰ぐ

### 5. maintenance — 取引不可・板寄せ中

- **API code**: 50003（現在取引不可）/ 50004（板寄せ中）
- **exit code**: `EXIT.GENERAL (1)`
- **GET**: `retry_after_long`（5〜15 分）。public のチャート取得は別系統で
  続けて良いことが多い
- **POST (trade)**: `abort_and_verify`
  - 板寄せ中は注文受付状態が不安定。再実行前に `active-orders` で実状況を確認
- **skill としての振る舞い**:
  - bitbank の定期メンテ時間帯（公式アナウンス参照）に当たることが多い
  - recipe 系の skill は途中で止め、現在時刻と合わせてユーザーに通知

### 6. system — システムエラー / 5xx

- **API code**: 70001、HTTP 500-599
- **exit code**: `EXIT.GENERAL (1)`
- **GET**: `retry_after_short`（5〜15 秒）。CLI が `http-core.ts` で最大 2 回まで
  自動再試行している。skill から追加で叩く場合も 1 回まで
- **POST (trade)**: `abort_and_verify`
  - silent success（CLI 側はエラーだが API は通っている）の可能性あり。
    必ず `active-orders` / `trade-history` / `assets` で確認
- **skill としての振る舞い**:
  - 連発する場合は bitbank 側の障害。skill を中止してユーザーに通知

### 6b. margin — 信用取引（`trade create-margin-order`）

- **API code**: 50058 / 50059 / 50060 / 50061 / 50062 / 50081〜50084 / 60019
  （40164 / 40167 は `EXIT.PARAM` なので `param`（§3）で個別判定する。下表にも併記）
- **exit code**: `EXIT.GENERAL (1)`（`state` / `balance` と同じく `error` 先頭のコードで
  個別判定する）
- **GET / POST**: POST（`trade create-margin-order`）でのみ発生
- **戦略**: コード別

| code | 内容 | 戦略 | skill としての振る舞い |
|---|---|---|---|
| 40164 | `position_side` が不正 | `no_retry`（`EXIT.PARAM (4)`） | `long` / `short` 以外を渡している。CLI の Zod で先に弾かれるので通常は到達しない |
| 40167 | 信用取引に対応していないペア | `no_retry`（`EXIT.PARAM (4)`） | `pairs` に信用フラグは無い。`bitbank margin-status` の `available_balances[].pair` に載るペアだけが対象 |
| 50058 | 信用取引の審査が未完了 | `no_retry` | bitbank で信用取引の申込・審査が必要。skill を中止してユーザーに案内 |
| 50059 / 50060 | 新規注文の一時制限 | `retry_after_medium` | 一時的な制限。時間を置いて **ユーザーの判断で** 再送（自動再送はしない） |
| 50061 | 新規建て可能額を超過 | `no_retry` | `bitbank margin-status` の `available_balances[pair].long / short` を確認し、数量を縮小するか中止 |
| 50062 | 建玉を超過 | `no_retry` | 返済数量が返済可能数量（`open_amount - locked_amount`）を超えている。`bitbank margin-positions` で確認。**建玉が無い状態で返済方向を出しても同じコードで拒否される**（逆方向の新規建てにはならない） |
| 50081〜50084 | 売り新規 / 売り返済 / 買い新規 / 買い返済 が停止中 | `no_retry` | 方向別の停止。他の方向は通ることがある。skill を中止してユーザーに通知 |
| 60019 | TakeProfit / StopLoss の side が返済方向でない | `no_retry` | CLI は `take_profit` / `stop_loss` を受け付けないので通常は到達しない |

### 7. network — タイムアウト・接続エラー

- **API code**: なし（fetch 例外）
- **exit code**: `EXIT.NETWORK (5)`
- **GET**: `retry_after_short`。CLI 側 (`http-core.ts`) が 2 回まで自動再試行
- **POST (trade)**: `abort_and_verify`
  - `http-private-post.ts` は `retryOnNetworkError: false` 強制。CLI が
    「失敗」と返しても、注文や出金が実際には通っている可能性がある
  - 再実行前に必ず `active-orders` / `trade-history` / `assets` で状態確認

## 判定の優先順位（skill 側の擬似コード）

```text
res = run_cli(...)
if res.success: ...
elif res.exitCode == AUTH: → auth
elif res.exitCode == RATE_LIMIT: → rate_limit
elif res.exitCode == PARAM:
  code = leadingCode(res.error)
  if code == 40167: → param（信用非対応ペア。margin-status の available_balances[].pair を確認）
  elif code == 40164: → param（position_side 不正）
  else: → param（引数の見直し）
elif res.exitCode == NETWORK: → network
else:                                   # ここから success: false かつ exitCode 未分類
  code = leadingCode(res.error)         # error 文字列先頭の数値（"60001: 残高不足" → 60001）
  if code == 60001: → balance
  elif code in (50003, 50004): → maintenance
  elif code == 50009: → state
  elif code in (50058, 50059, 50060, 50061, 50062,
                50081, 50082, 50083, 50084, 60019): → margin（コード別の戦略は 6b の表）
  elif code == 70001 or HTTP 5xx: → system
  else: → 未分類。GENERAL として扱い、skill を中止してユーザーに raw error を提示
```

注: `param` は exit code、`state` / `balance` / `maintenance` / `margin` / `system` は
`error` 文字列先頭のコードで判定する。`apiErrorExitCode` の範囲外コードは exit code
が GENERAL に丸まるため、`error` 先頭の API code を直接見る必要がある。

## 関連

- 公式エラー一覧: <https://github.com/bitbankinc/bitbank-api-docs/blob/master/errors.md>
- 取引安全ガード: `.claude/rules/trading-safety.md`
- Result パターン: `_shared/references/cli-conventions.md`
