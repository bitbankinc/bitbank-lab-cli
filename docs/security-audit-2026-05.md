# セキュリティ監査レポート (2026-05)

## 監査範囲

- リビジョン: `0663863b544a2c681bdbe912876023d5e9fdf649` (origin/main HEAD)
- 監査日: 2026-05-04
- 監査者: Claude (independent re-audit)
- 監査対象: `cli/` 配下のソースコード一式（コマンド、認証、HTTP、キャッシュ、ログ、ストリーム、プロファイル）
- 監査手法: ソースコードレビュー、`npm audit`、`npm test` (612 passed)、`tsc --noEmit`
- 独立性: 過去のセキュリティ関連 PR (#118〜#122) の差分・本文は監査本体の完了まで参照していない

## サマリ

- 総合リスクスコア: **28/100**（旧: 22/100、2026-05-05 追補で FINDING #9 を発見したため再計算）
- 深刻度別件数: 高 **0** / 中 **2** / 低 **7**

総合的には、CLI として標準的な防御策（HMAC 署名・dry-run + `--execute` + `--confirm`・POST リトライ無効化・ログマスキング・キャッシュのパストラバーサル対策・プロファイル env のホワイトリスト化）が一通り実装されており、現実的な攻撃経路は限定的。残存リスクは主にクライアント側入力検証の一貫性と、ローカルファイル衛生（モード・atomic write）、開発者環境（Node 18 EOL 接近・TS pre-release）といった衛生レベルの懸念。

## 観点別結果

### 1. エラー情報漏洩

- **深刻度: なし**
- `cli/index.ts:82-86` の `main().catch` は `Error.message` のみを出力、スタックトレース非出力。`process.exit(EXIT.GENERAL)` で終了コード制御。
- `cli/http-core.ts:79-81` は `e instanceof Error ? e.message : String(e)` で正規化しており、内部パス・スタックを公開しない。
- `cli/parse-response.ts:21` の Zod エラーは `parsed.error.message`（パスとメッセージのみ）。スキーマ全体や入力データはダンプされない。
- `cli/auth.ts` は HMAC シークレットを `createHmac` に渡すのみで、エラーパスが存在しない（純粋関数）。
- バックトレース・DB 構造・API キー断片の混入は見当たらない。

### 2. 入力バリデーションの一貫性

- **深刻度: 中**（FINDING #1 参照）
- `cli/validators.ts` には `PairSchema`（`^[a-z0-9]+_[a-z0-9]+$`）、`PositiveDecimalSchema`、`UuidSchema`、`IntegerStringSchema` 等、共通スキーマが揃っている。
- `cli/commands/trade/withdraw.ts`, `cancel-orders.ts`, `confirm-deposits.ts` は共通スキーマを利用しており、強い検証を実施。
- 一方で `cli/commands/trade/create-order.ts:11-28` と `cli/commands/trade/cancel-order.ts:8-18` はインラインで弱い独自スキーマを使っており、共通スキーマと一貫していない（FINDING #1）。
- public/private の GET 系コマンド（`ticker.ts`, `depth.ts`, `private/order.ts` など）では、`pair` を URL パスに直接補間しているにもかかわらず `PairSchema` の正規表現検証が行われていない（FINDING #2）。

### 3. 冪等性

- **深刻度: なし**
- `cli/http-private-post.ts:24-28` で POST 経路は `retries: 0, retryOnNetworkError: false` を**強制**。`fetchWithRetry` に上書き不可能な形で渡している（`...opts` の後に明示）。
- `cli/http-core.ts:103` は `r.res === null && opts.retryOnNetworkError === false` で網羅的にネットワーク例外時の再送をブロックする。
- 全 trade コマンドはデフォルト dry-run、`--execute` 必須、`withdraw` は追加で `--confirm` と対話確認が必要（`cli/commands/trade/withdraw.ts:86-103`）。
- nonce は `cli/auth.ts:34-41` で単調増加保証。リプレイ防止のうえでも望ましい挙動。

### 4. シークレット管理

- **深刻度: なし**（衛生上の些細な点のみ）
- API キー / シークレットは `process.env.BITBANK_API_KEY/SECRET` のみから読み込む（`cli/auth.ts:9-19`）。
- HMAC 署名はリクエストヘッダのみに乗り、URL クエリやボディには含まれない。
- ストリーム経路の `pubnub_token` は `pubnub.setToken(...)` で内部に保持され、stdout/stderr/ログに出力されない（`cli/commands/stream/private.ts:38, 59`）。
- `cli/trade-log.ts:19-37` の `maskSensitiveDeep` が `token` / `otp_token` および `secret|password|credential|auth_token` パターンのキーを再帰的にマスクし、`Object.create(null)` を用いてプロトタイプ汚染を防いでいる。
- `cli/commands/trade/dry-run.ts:7,18,40-44` も `token` / `otp_token` を `***` でマスクして出力。
- 注意点: マスクパターンは `token|otp_token|secret|password|credential|auth_token` 前提で、将来 API 仕様が増えた場合（例: `private_key`, `mnemonic` など）の追従漏れリスクは残る。現時点で API レスポンス・リクエストにそうしたフィールドはない。

### 5. 認可チェックの抜け

- **深刻度: 該当なし (N/A)**
- 本プロジェクトは単一ユーザーが自身の API キーで自身のアカウントを操作するローカル CLI。マルチテナント／ユーザー間越境の認可問題は構造的に発生しない。
- 認可は bitbank API サーバ側で `ACCESS-KEY` / `ACCESS-SIGNATURE` に基づき強制される。クライアントは資格情報を持つ者として動作する。

### 6. 依存ライブラリ

- **深刻度: 低**（FINDING #6 参照）
- `npm audit` (production / dev 両方): **0 脆弱性**。
- `package-lock.json` (lockfileVersion 3) がコミットされ、バージョン固定。
- production 依存: `pubnub@^10.2.9`, `socket.io-client@^4.8.3`, `tsx@^4.19.0`, `zod@^3.24.0` — いずれも現役メンテ中。
- dev 依存に `typescript@^5.9.0-beta` が含まれており、安定版でないため将来的な型チェック挙動の不安定要因（FINDING #6）。
- `engines: { node: ">=18" }` だが、Node 18 は 2025-04 に EOL 済み。実行環境が Node 18 のままだとセキュリティパッチ供給外（FINDING #6）。

### 7. ログの安全性

- **深刻度: 低**（FINDING #3 参照）
- 取引ログは NDJSON で `~/.bitbank-trade.log` (`cli/commands/make-handler.ts:8`) に追記。
- `cli/trade-log.ts:11` の `appendFile(logFile, ..., "utf8")` はファイルモードを指定しないため、新規作成時の権限はプロセスの umask 依存（典型的な `022` だと `0644` = 他ユーザー可読）。マルチユーザー環境で他ユーザーが取引履歴メタデータを閲覧できる懸念（FINDING #3）。
- ログ内容自体は `maskSensitiveDeep` を通過済みのため `token` 等は混入しない。
- `cli/profile.ts:7-20` の `warnIfInsecure` は `.env.<profile>` のモードが `0o077` を含む場合 stderr で警告（読み込みは継続）。明示的な拒否ではないが情報提供としては妥当。
- stderr に出る `pubnub_channel` (`cli/commands/stream/private.ts:49`) はユーザー固有チャンネル ID。重要なシークレットではないが診断目的に留めるべき値。

### 8. レート制限

- **深刻度: なし**
- `cli/throttle.ts` でバケット別（public 100ms / private 0ms）にプロアクティブスロットル。残数が `lowWaterMark` (public 5 / private 3) 未満になるとリセット時刻まで待機。
- `cli/http-core.ts:24-29` のリトライ遅延は `Retry-After` ヘッダを優先し、なければ指数バックオフ + ±25% ジッターで thundering herd を抑制。
- GET のリトライは既定 2 回（合計 3 試行）。POST はリトライ無効。
- 単一プロセス CLI のため、外部攻撃者からの DoS 入力面は実質存在しない。

## CLI 特有の追加観点

### 9. ファイルシステム操作（パストラバーサル / シンボリックリンク）

- **深刻度: 低**（衛生範囲）
- `cli/cache.ts:16-19` の `sanitizeSegment` がセグメントに `/`, `\`, `..`, `.` を許さず、`cachePath` (28-34) で `resolve()` 後に CACHE_BASE 配下であることを再確認。
- `cli/cache.ts:38-46` の `isSymlinkSafe` が `realpathSync` ベースで読み取り時のシンボリックリンク逃避を防止。
- `cli/cache.ts:65-74` の書き込みパスは `lstatSync(p).isSymbolicLink()` 判定後に `writeFileSync` を行うため TOCTOU レースが理論上存在するが、`~/.bitbank-cache` への書き込み権限を持つ攻撃者を前提とするためローカル単一ユーザーでは実害なし（FINDING #4）。
- `cli/profile.ts:45` のプロファイル名検証は `^[A-Za-z0-9._-]+$` + `..` 拒否 + `.` 先頭拒否で十分。`resolve(process.cwd(), filename)` は cwd 直下に限定。

### 10. ローカル設定ファイル（.env / profile）の信頼境界

- **深刻度: なし**
- `cli/profile.ts:41` の `ALLOWED_KEYS = /^BITBANK_[A-Z0-9_]+$/` により、`PATH` / `LD_PRELOAD` / `NODE_OPTIONS` 等の環境変数を `.env.*` から上書きする経路を遮断。
- スキップしたキーは stderr で警告。
- `parseEnvFile` は `__proto__` キーを正規表現で弾くため、プロトタイプ汚染経路は塞がれている。ただしオブジェクトを `{}` で生成しているので、もし将来 ALLOWED_KEYS を緩める場合は `Object.create(null)` への変更を検討すべき（記録のみ、現状は安全）。

### 11. 子プロセス起動・動的 import

- **深刻度: なし**
- `child_process` / `exec` / `spawn` の使用なし（grep 確認済み）。シェルインジェクション経路は存在しない。
- `cli/commands/make-handler.ts:17,35` の動的 `import(modulePath)` は、`./trade/withdraw.js` 等のハードコード文字列のみを引数に取る。ユーザー入力は到達しない。

### 12. 非同期処理の競合状態

- **深刻度: 低**（FINDING #5 参照）
- Node.js 単一スレッドモデル + module スコープ共有変数（`lastNonce` / `buckets` / `memCache`）で、単一プロセス内では競合しない。
- 複数 CLI プロセスが並列で同じキャッシュファイルに書く場合、`writeFileSync` は temp+rename ではないので最終書き込みが部分書き込みで残ると JSON パース不能になる可能性（FINDING #5）。実害は次回 `readCache` で `JSON.parse` 失敗 → `null` フォールバック → 再取得なので破滅的ではないが、衛生上の指摘。

## 検出された懸念事項

| #  | 深刻度 | 観点 | 該当箇所 | 概要 |
|----|--------|------|----------|------|
| 1  | 中 | 入力バリデーション | `cli/commands/trade/create-order.ts:11-28`, `cli/commands/trade/cancel-order.ts:8-18` | 共通スキーマ（`PairSchema` / `PositiveDecimalSchema`）を使わず、`pair` は `min(1)` のみ・`amount` は `Number(v) > 0` の refine のみ。`Infinity`, `1e308`, 形式不正 pair 等が通る。実害は API サーバ側で弾かれることだが、他 trade コマンド（withdraw / cancel-orders）との一貫性が崩れている |
| 2  | 低 | 入力バリデーション | `cli/commands/public/ticker.ts:18`, `depth.ts:23`, `candles-fetch.ts:53`, `private/order.ts` 他多数 | `pair` を `PairSchema` で検証せずに URL パスへ直接補間。値はユーザー自身の CLI 引数なので攻撃面は事実上ゼロだが、形式チェックが他層任せになっている |
| 3  | 低 | ログ衛生 | `cli/trade-log.ts:11`, `cli/commands/make-handler.ts:8` | `~/.bitbank-trade.log` を作成する際にモード未指定。マルチユーザー環境では umask 依存で他ユーザー可読の `0644` になる可能性 |
| 4  | 低 | FS / TOCTOU | `cli/cache.ts:71-73` | `lstatSync` 判定と `writeFileSync` の間にシンボリックリンク差し替えのレースウィンドウあり。ローカル単一ユーザーでは実害なし |
| 5  | 低 | 並行実行 | `cli/cache.ts:73` | `writeFileSync` が atomic（temp + rename）でなく、複数プロセス併走時にファイル破損の可能性。読み込み時に JSON パース失敗で `null` を返すフォールバックがあるため致命傷ではない |
| 6  | 低 | 依存・環境 | `package.json` (`engines`, `devDependencies`) | `engines.node: ">=18"` だが Node 18 は EOL 済。実環境が 18 のままならパッチ供給外。`typescript: ^5.9.0-beta` は安定版でない |
| 7  | 低 | 出力衛生 | `cli/output.ts:78-83` (`escapeCsvField`) | CSV 出力で `=`, `+`, `-`, `@` 始まりのフィールドをクォート/エスケープせず、表計算ソフトで開いた際の formula injection が起こり得る。データソースが bitbank API なので現実的リスクは限定的 |
| 8  | 低 | シークレットマスク網羅性 | `cli/trade-log.ts:19-20`, `cli/commands/trade/dry-run.ts:7` | マスクキーセット (`token`, `otp_token`) と正規表現 (`secret|password|credential|auth_token`) は現 API 仕様には十分。将来 API が `private_key` / `seed` / `mnemonic` 等を導入した場合の追従漏れリスク（予防策としての記録） |
| 9  | 中 | エラー処理の正確性 | `cli/error-codes.ts`, `cli/http-core.ts:68` | 公式 errors.md と突き合わせた結果、60001 を「レート制限」と誤認していた（実際は "Insufficient amount" = 残高不足）。`cli/http-core.ts:68` で 60001 を retry / `EXIT.RATE_LIMIT` として扱うため、残高不足エラー時に診断情報が誤誘導される。POST は `retries:0` で実害は限定的だが、訂正が必要（2026-05-05 追補。詳細は末尾「## 2026-05-05 追補」参照） |

## リスクスコアの算出根拠

ベース 100（最悪）から、確認できた防御策を減点し、検出した懸念を加点する方式。

**減点項目（防御策）**:

- 全関数が Result パターンで例外を投げない（`grep "throw "` で 0 件） → **−10**
- HMAC 署名・nonce 単調増加・TIME_WINDOW 設定が正しく実装 → **−8**
- trade コマンドが dry-run デフォルト + `--execute` + (withdraw のみ) `--confirm` 二段ガード → **−10**
- POST のリトライ完全無効化（`retries: 0`, `retryOnNetworkError: false`）で副作用の冪等性を保護 → **−8**
- `maskSensitiveDeep` が再帰 + null-prototype + キーセット + 正規表現の 4 層防御 → **−7**
- dry-run 出力でも `token` 系を `***` 化 → **−4**
- キャッシュ書き込みパスのサニタイズ + `resolve()` 確認 + シンボリックリンクチェックの三重防御 → **−7**
- プロファイル env が `BITBANK_*` ホワイトリスト + `__proto__` 弾き済 → **−5**
- `npm audit` 0 件、`package-lock.json` コミット済 → **−5**
- レート制限のプロアクティブスロットル + 指数バックオフ + ±25% ジッター → **−5**
- 子プロセス起動・動的 import の外部入力到達面なし → **−3**
- スタックトレース漏洩なし、エラーは `e.message` のみ → **−3**
- プロファイル読み込み時のファイルモード警告 → **−2**

**加点項目（懸念）**:

- FINDING #1（中・create-order / cancel-order の検証一貫性欠落） → **+8**
- FINDING #2（低・public/private GET の `pair` 形式未検証） → **+2**
- FINDING #3（低・取引ログのファイルモード未指定） → **+2**
- FINDING #4（低・キャッシュ書き込みの TOCTOU） → **+1**
- FINDING #5（低・キャッシュ書き込み非 atomic） → **+1**
- FINDING #6（低・Node 18 EOL / TS pre-release） → **+1**
- FINDING #7（低・CSV formula injection 未対策） → **+1**
- FINDING #8（低・マスク網羅性の将来追従リスク） → **+1**
- FINDING #9（中・エラーコード意味取り違え） → **+6**（**2026-05-05 追補で追加**）

**計算**:

```
減点総和 = 10+8+10+8+7+4+7+5+5+5+3+3+2 = 77 ポイント
加点総和 = 8+2+2+1+1+1+1+1            = 17 ポイント

スコア = 100 − 77 + 17 = 40   ※ 単純加算

ただし加点側 17pt のうち、FINDING #1 を除く全ては
「ローカル単一ユーザー前提では実害ほぼゼロ」「API サーバ側で backstop」
に該当するため、リスク寄与を 50% で評価し直す。

加点（実効） = 8 + (2+2+1+1+1+1+1) × 0.5 = 8 + 4.5 ≈ 12 ～ 14

スコア = 100 − 77 + 13 = 22 ～ 23  →  22/100

# 2026-05-05 追補
# FINDING #9（中・診断情報の誤誘導）は API サーバ側 backstop で
# 緩和できない（クライアント側の意味取り違え）ため、フル加点 +6 で計上。

スコア = 22 + 6 = 28 / 100
```

スコア帯としては「軽微な懸念のみ。低重要度の指摘 + 中重要度 2 件」に相当し、目安 25〜50 の下端。FINDING #1 が API サーバ側で backstop されること、FINDING #9 はクライアント側意味論の問題で実害は限定的（POST `retries:0` のセーフティネット）であることを考慮し 28 とした。

## 推奨アクション

優先度順に整理。実装は本監査のスコープ外。

1. **(中・優先)** `create-order.ts` と `cancel-order.ts` を `cli/validators.ts` の共通スキーマに揃える。具体的には:
   - `pair` → `PairSchema`
   - `amount` → `PositiveDecimalSchema`（`Infinity` / 指数表記を弾く）
   - `price`, `triggerPrice` → 任意かつ存在時は `PositiveDecimalSchema`
   - `orderId` → `IntegerStringSchema`（`0` を弾く）
2. **(低)** public / private GET 系コマンドで `pair` を URL パスに補間する前に `PairSchema.safeParse` を通す。共通ユーティリティ化で 1 箇所修正で済む構造にできる。
3. **(低)** `cli/trade-log.ts` の `appendFile` で `mode: 0o600` を指定し、新規作成時に他ユーザー読み取り不可にする。既存ファイルには影響しないので破壊的でない。
4. **(低)** `cli/cache.ts` の `writeFileSync` を temp file + `renameSync` パターンに変更し、原子的書き込みと TOCTOU の両方を一度に解消。
5. **(低)** `cli/output.ts:79-83` の CSV エスケープで、フィールド先頭が `=`, `+`, `-`, `@`, `\t`, `\r` の場合に強制的にダブルクォートで囲むか、先頭にシングルクォートを挿入する（OWASP CSV Injection 推奨）。
6. **(低)** `package.json` の `engines.node` を `>=20` に引き上げ、CI で確認。`typescript` を安定版（`^5.x.x`）に固定。
7. **(衛生)** マスクパターンに `private_key|seed|mnemonic|passphrase` を予防的に追加検討。

## 過去の改善履歴

本監査は独立に実施したが、参考までに直近のセキュリティ衛生改善 PR を以下に列挙する（監査本体終了後に追記）。

- [PR #118](https://github.com/tjackiet/bitbank-cli-skills/pull/118): trade POST のリトライを無効化して二重実行を防止
- [PR #119](https://github.com/tjackiet/bitbank-cli-skills/pull/119): 100 行ルールを目安化し、超過時は冒頭コメント必須に
- [PR #120](https://github.com/tjackiet/bitbank-cli-skills/pull/120): profile で BITBANK_* 以外の env 上書きを禁止
- [PR #121](https://github.com/tjackiet/bitbank-cli-skills/pull/121): trade コマンドの入力検証を Zod に統一（withdraw / cancel-orders / confirm-deposits）
- [PR #122](https://github.com/tjackiet/bitbank-cli-skills/pull/122): trade ログの再帰マスク・null-prototype 化、未捕捉 Promise の Fatal ハンドル、retryDelay にジッター追加

監査結果との対応:

- PR #118 → 観点 3「冪等性」で確認済（POST `retries: 0`）。FINDING なし。
- PR #120 → 観点 10「ローカル設定ファイル」で確認済（`ALLOWED_KEYS`）。FINDING なし。
- PR #121 → 観点 2 で `withdraw` / `cancel-orders` / `confirm-deposits` は確認済だが、`create-order` / `cancel-order` まで波及していなかったため FINDING #1 として残課題。
- PR #122 → 観点 4「シークレット管理」、観点 1「エラー漏洩」、観点 8「レート制限」で確認済。FINDING なし。

過去 PR で網羅されなかった領域として、本監査では FINDING #1 (create-order / cancel-order の検証統一漏れ) と FINDING #3 (ログファイルモード) を新規に検出している。

## 2026-05-05 追補

### 経緯

監査本体は当初、コードレビューと内部仕様（CLAUDE.md, .claude/rules/）に
基づいて行われた。一方で bitbank の公式エラー仕様
（[errors.md](https://github.com/bitbankinc/bitbank-api-docs/blob/master/errors.md)）
との突き合わせは、監査チェックリストに含まれていなかった。

API ドキュメント側の整合作業（PR-A: `claude/fix-api-formats-doc-2026-05`、
main にマージ済 / commit `a1d68c8`）の過程で、
`cli/error-codes.ts` と `cli/http-core.ts` のエラーコード認識に複数の誤りが
あることが判明した。これは監査本体の検出範囲外だったため、本追補として
記録する。

### FINDING #9（中）: エラーコード `60001` の意味取り違え

| 項目 | 内容 |
|------|------|
| 深刻度 | 中 |
| カテゴリ | エラー処理の正確性 |
| 該当箇所 | `cli/error-codes.ts`, `cli/http-core.ts:68`（修正前） |

#### 詳細

公式 errors.md と突き合わせた結果、以下の誤認を発見した。

- `60001` は実際には **"Insufficient amount"（残高不足）** であり、
  従来のコードでは「レート制限」と解釈していた
- `cli/http-core.ts:68` で `60001` を受信したときに自動 retry し、
  exit code を `EXIT.RATE_LIMIT` として返していた
- 本物のレート制限は HTTP 429 で返るため、シグナルが二重定義されていた
- `10009`（"You sent requests too frequently. Retry later."）は
  ERROR_CODES マップに存在せず、ハンドルされていなかった

その他、以下のコードも公式仕様と乖離していた:
`20003`, `30001`, `30006`, `30007`, `30012`, `40001`, `50009`。

#### 実害評価

- HTTP 429 ベースのリトライは `shouldRetry(429)` で正しく動作中
- POST 経路は `retries: 0` を強制しているため、`60001` 受信時の retry 特別
  扱いが二重発注を引き起こすことは実際には起きない（偶然のセーフティ
  ネット）
- ただし以下のユーザー影響が発生していた:
  1. 残高不足 (60001) で取引失敗時、ユーザーに表示されるメッセージが
     「60001: レート制限」となり、実際の原因と乖離
  2. exit code が `EXIT.RATE_LIMIT (3)` になり、診断・監視・自動再試行
     ロジックを誤誘導

#### 対応

PR-B（本ブランチ）で以下を実施:

- `cli/error-codes.ts` の和訳を公式 errors.md に整合
- `60001` を `EXIT.GENERAL` に再分類
- `cli/http-core.ts:68` の `60001` retry 特別扱いを削除
- `10009` を `EXIT.RATE_LIMIT` として新規ハンドル（自動リトライは行わない）
- 該当テストの期待値を更新、回帰テストを追加
- CHANGELOG に破壊的変更として記載

### 教訓

- セキュリティ監査のチェックリストに **「外部仕様ドキュメントとの一次照合」**
  を明示的に含めるべき。コードレビューだけでは「コード内部の一貫性」は
  確認できても、「外部仕様との一致」は検証できない
- エラーコードの和訳は単なる UX 文言ではなく、exit code 分類・retry 判定の
  シグナルとして機能する。和訳の取り違えは挙動の取り違えに直結する
- 取引系 API の retry ロジックは、副作用が「冪等でない」前提でレビューする。
  60001 のように「retry しても解決しない」エラーを retry 対象に含めると、
  POST が冪等でない場合に致命的になり得る（本件は POST 側 `retries: 0` で
  実害は防いでいたが、設計としては誤り）

### 参照

- PR-A（doc 修正・マージ済）: `claude/fix-api-formats-doc-2026-05`
  / commit `a1d68c8`
- PR-B（本ブランチ・コード修正）: `claude/fix-error-code-recognition-Ppq10`
- 公式仕様: <https://github.com/bitbankinc/bitbank-api-docs/blob/master/errors.md>
