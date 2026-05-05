# Changelog

[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) 形式で管理しています。  
[Semantic Versioning](https://semver.org/lang/ja/) に準拠します。

## [Unreleased]

### Breaking Changes

- `engines.node` を `>=18` から `>=20` に引き上げ。Node 18 は 2025-04 に EOL を
  迎えており、セキュリティパッチの供給対象外となるため。Node 20 未満の環境では
  `npm install` 時に警告（または `--engine-strict` 設定下では失敗）するように
  なった。あわせて CI (`.github/workflows/ci.yml`) の Node version も 20 に更新。
- `typescript` の version range を `^5.9.0-beta` から安定版 `^5.7.0` に変更。
  pre-release 版は dev tooling の予期せぬ挙動変動を招くため、安定版系列に
  切り替える。caret range なので `>=5.7.0 <6.0.0` の範囲で最新の 5.x が
  解決される（現時点では 5.9.3）。
- `@types/node` を `^22.0.0` → `^20.0.0` にダウングレード。`engines.node: ">=20"`
  で宣言した最低サポートラインに型定義を揃え、Node 22 専用 API（`node:sqlite`、
  ネイティブ `WebSocket` 等）が tsc を通過してしまう不整合を解消する。
- `--profile=<name>` で読み込まれる `.env.<profile>` ファイルから、
  `BITBANK_*` 以外の env 変数が反映されなくなった。それ以外のキーが
  含まれる場合は stderr に警告を出して無視する。
  これは profile 経由の任意 env 上書き（`NODE_OPTIONS` など）による
  コード実行リスクを断つための安全側の変更。
- プロファイル名の許容文字を `^[A-Za-z0-9._-]+$` に厳格化。
  先頭ドットのプロファイル名（`.hidden` など）も拒否される。

### Added

- `volatility-profile` skill: リターン分布・ファットテール・時間帯別出来高などリスク特性を定量化
- `signal-explorer` skill: シグナル候補の予測力評価（相関・Z-score・ラグ相関・冗長性チェック）
- `correlation-analysis` skill: 複数銘柄間の相関・β・環境別相関・ラグ相関
- `data-verification` skill: ローソク足の欠損・整合性・異常値・重複の品質検証
- `indicator-analysis` skill に ATR と ROC を追加
- `.claude/skills/_shared/references/` に共通参照資料（`bitbank-api-formats.md` / `pair-classification.md`）を集約

### Changed

- リトライバックオフに ±25% のジッターを追加。複数クライアント同時実行時の
  リトライ同期（thundering herd）を緩和。
- trade ログの `data` フィールドも再帰的に sensitive キーをマスク。
  従来は `params` のみマスクしていたが、API レスポンス側に token 等が
  含まれた場合に素通りする可能性があった。
- trade ログ (`~/.bitbank-trade.log` 等) の新規作成時のパーミッションを
  `0o600`（オーナーのみ読み書き）に制限。従来は umask 依存で `0o644` になり、
  同一ホストの他ユーザーから読める可能性があった。既存ファイルのモードは
  変更しない（必要なら `chmod 600` で手動変更）。
- キャッシュ書き込み (`cli/cache.ts`) を temp + `rename(2)` の atomic 置換に
  変更。従来は lstat 判定と書き込みの間に TOCTOU レースがあり、複数プロセス
  併走時に書き込みが atomic でなかった。同一 FS 上の inode 差し替えにより
  読み手が部分書き込みを観測しないことを保証する（既存のシンボリックリンク
  防御は維持）。
- CSV 出力 (`cli/output.ts`) の `escapeCsvField` を OWASP CSV Injection 推奨
  パターンに準拠。フィールド先頭が `=` `+` `-` `@` `\t` `\r` のいずれかなら
  ダブルクォートで囲む。表計算ソフトで開いた際の数式評価による情報漏洩や
  外部リクエストを防止する。既存の `,` `"` `\n` のエスケープ挙動は変わらない。
- `cli/index.ts` の起動部に未捕捉 Promise のセーフティネットを追加。
  Result パターンで吸収できなかった例外を `Fatal: <message>` として
  stderr に出して exit code を返すようになった。
- README / `docs/phases.md` / `docs/customization-guide.md` / `.claude/rules/skills.md` を 7 Skill 構成と `_shared/references/` 運用に合わせて更新
- `withdraw` / `cancel-orders` / `confirm-deposits` の入力検証を Zod に統一。
  以下のケースが従来は素通りしていたが、CLI 層で弾くようになった:
  - `withdraw --amount=Infinity` / `--amount=1e308` / `--amount=NaN`
  - `withdraw --uuid=<UUID形式以外>`
  - `withdraw --asset=<英数以外>`
  - `cancel-orders --order-ids=1.5,2`（小数点）
  - `confirm-deposits --id=abc`（非数値）
  既存の正常系（`amount=0.5`、`uuid=xxx-yyy-...` 等）の挙動は変わらない。
  バリデーションエラーメッセージのフォーマットは変更されている（複数 issue は `;` 区切り）。
- `create-order` / `cancel-order` および public/private GET 系の `pair` 入力検証を
  共通スキーマ（`PairSchema` / `PositiveDecimalSchema` / `IntegerStringSchema`）に統一。
  以下のケースが従来は素通りしていたが、CLI 層で弾くようになった（破壊的変更）:
  - `create-order --amount=Infinity` / `--amount=1e308` / `--amount=+1`
  - `create-order --price=-100` / `--trigger-price=Infinity` 等の非正値・指数表記
  - `create-order --pair=foo`（`^[a-z0-9]+_[a-z0-9]+$` 形式不正）
  - `cancel-order --order-id=0` / `--order-id=abc`（0 や非整数）
  - `ticker` / `depth` / `transactions` / `circuit-break` / `candles` /
    `order` / `active-orders` / `trade-history` / `trade-history-all` /
    `orders-info` / `margin-positions` で形式不正な `pair` を URL に補間する前に拒否
  - `order --order-id=0` / `--order-id=abc`（`IntegerStringSchema` で検証）
  - `orders-info --order-ids=1,abc` / `,1,2` / `1,0,2`（NaN・先頭カンマ・0 の混入）
  共通ヘルパ `validatePair(pair, missingMessage)` を `cli/validators.ts` に追加。
  `active-orders` / `margin-positions` では検証後の正規化値（trim 済み）を
  リクエストパラメータに使うように修正。
  `cancel-order --order-id` 未指定時のエラー文言が
  `order-id is required. Example: --order-id=12345` から
  `id is required. Example: --id=12345` に変更（共通スキーマ既定の文言）。
