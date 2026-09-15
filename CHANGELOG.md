# Changelog

[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) 形式で管理しています。  
[Semantic Versioning](https://semver.org/lang/ja/) に準拠します。

> **本リポジトリは bitbank の PoC サンドボックスです。**
> 0.x の間は API・出力フォーマット・コマンド構成に破壊的変更を含む可能性があります
> （SemVer 0.x の慣習に従う）。1.0.0 への到達は当面予定していません。
>
> 公式 Org への移管時は、ownership 変更を CHANGELOG のリリースノートに記録します
> （バージョン番号には影響しません）。

## [Unreleased]

## [0.5.0] - 2026-09-14

### Added

- **`bitbank periodical-brief` を追加**（upstream #21）。複数銘柄の商い状況を 1 銘柄 3 行
  （現在値・始値比・RSI14・MACD 符号・SMA20/50/200 との位置・曜日別出来高・直近確定日の
  値動き・ATR14）に圧縮して返す。銘柄は位置引数 / `--pairs` / `--top=N`（24h 売買代金上位）/
  `--all`（現行の取扱い JPY 建て全銘柄）。生ローソク足を LLM に渡すと 1 回の日次分析で
  数万トークンを消費し検算も高コストなため、指標計算を CLI 側に置く。分析ロジックを CLI に
  置かない原則（ADR-002）の例外で、根拠は
  [ADR-008](docs/adr/008-periodical-brief-indicators-in-cli.md)。**public GET のみ**・
  指標は**確定日足のみ**で計算・売買判断は出さない。同時実行は既定 16（`--concurrency`）で、
  無制限だと 30 銘柄超で失速する実測に基づく。一部銘柄の失敗は落とさず `errors` +
  `partial: true` で申告する。`--format=table` はダイジェスト本文をそのまま出す
  （cron / 通知向け）。対の Skill `periodical-brief`（「朝のブリーフ出して」）を追加。
  **提案・出力書式・取得設計・参考実装（Rust）・レート制限と CPU 時間の実測は
  [@aobathree](https://github.com/aobathree)**（upstream #21）による。TypeScript 版は
  それを本 CLI の規約（Result パターン・Zod・`KNOWN_PAIRS` への絞り込み・部分失敗の申告）に
  移植したもので、差分は ADR-008 に記載

- **paper: 全コマンドが `meta.statePath` で参照した state file を申告するようになった**（#27）。
  `BITBANK_PAPER_STATE_PATH` で複数の仮想口座を切り替えて使う場合、環境変数を付け忘れると
  既定パスへ静かにフォールバックし、別口座の残高が `success: true` で返っていた。
  `--machine` / `--format=json` の envelope に載る。あわせて `BITBANK_PAPER_STATE_PATH` を
  README・runbook・Skill の参照資料に記載した（従来は `cli/paper-state.ts` にしか無かった）

- **`bitbank --version` / `-v` を追加した**（#28）。package.json の version を出す。
  `--machine` 併用時は他コマンドと同じ envelope（`{"success":true,"data":{"version":...}}`）。
  fnm 等で Node ごとにグローバル install が分かれ、シェルと launchd で別バージョンが
  動いていた事例が 1 コマンドで見分けられるようになる

- **pre-commit で秘密情報を走査するようにした**（`lefthook.yml`）。ステージ済みの
  「中身」を gitleaks で、ファイル名を `secret-file-names` で検査する。一度 commit すると
  鍵は git 履歴に残り、除去には履歴の書き換えと鍵の失効・再発行が要る。CI
  （`security.yml`）の全履歴スキャンは最終防衛線だが、そこで検知した時点で既に履歴に
  入っているため、**履歴に入る前に止められる唯一の場所**として pre-commit を本命の防御に
  据えた。GitHub の push protection も push 時点の網であり、かつ bitbank は GitHub の
  secret scanning パートナーではないため bitbank API キー専用の検出器が存在しない
  （[repo-security.md](docs/dev/repo-security.md)）。gitleaks 未導入の環境では警告のみで
  スキップし、コントリビュータの参入障壁にはしない（`LEFTHOOK_REQUIRE_GITLEAKS=1` で
  未導入をエラーに、`LEFTHOOK_SKIP_GITLEAKS=1` でスキャン自体をスキップできる）。
  ローカルは PATH 上の gitleaks を使うため、CI が SHA256 検証つきで固定する 8.30.1 と
  バージョンが一致するとは限らない。最終的な判定は CI の固定バージョンが行う
- `.gitignore` に認証情報らしきファイル（`*.pem` / `*.key` / `id_rsa*` / `id_ed25519*` /
  `credentials.json`）を追加した。`.gitignore` は `git add -f` と追跡済みファイルを防げない
  ため、同じ集合を pre-commit の `secret-file-names` でも見る 2 段構えにしている
- 運用手順を [CONTRIBUTING.md](CONTRIBUTING.md)（環境変数・誤検知時の `gitleaks:allow`・
  なぜ pre-commit で止めるのか）と [repo-security.md](docs/dev/repo-security.md)
  （Secret Protection / Push protection の設定とその限界）に記述した。
  `.contrib/setup.sh` は gitleaks の導入有無を確認して案内する

### Changed

- **CI の非ブロッキングな `npm audit` を削除し、`security.yml` に一本化した**
  （`.github/workflows/ci.yml`）。`security.yml` は `--audit-level=high` でブロッキングに
  走り、high は critical を含むため、ci.yml 側に critical の audit を置いても
  `security.yml` の部分集合にしかならなかった。非ブロッキングな audit を重ねると
  「チェックがある」ように見えて実際には止まらないため、あえて置かない

### Fixed

- **paper: 残高の丸め誤差で全量売却が永久に通らなくなる問題を直した**（#30）。
  売買を繰り返すと残高が `0.0031999999999999967` のように目減りし、`pnl` の
  position（`0.0032`）をそのまま `create-order --side=sell` に渡すと
  `insufficient` で弾かれ続けていた。約定後の残高と履歴から積む position を
  同じ桁（10 桁）で snap し（`cli/paper-precision.ts`）、残高チェックは `1e-9` の
  誤差を許容する。`pnl` と `assets` が同じ数値を返すようになる。修正前に書かれた
  誤差入りの state もそのまま全量売却できる

- **README が実装に追従していなかったのを直した。** コマンド一覧に `bitbank tax`
  （`events` / `reconcile` / `pnl` / `verify-report`）・`balance-history`・`profile` の
  3 つが載っておらず、Agent Skills にも `tax-report` が無かった（カテゴリ小計が
  7 + 1 + 2 + 2 = 12 本のまま。実数は 13 本）。chaos `s09` が検査するのは Skill の
  **総数**プローズだけで、README でそれに当たるディレクトリツリー注記は 13 本と正しかった
  ため、カテゴリ小計のズレは誰にも検出されないまま残っていた。`skills/INDEX.md` と
  `docs/skill-workflow.md` は 3 つとも収録済みで、追従できていなかったのは README だけ

## [0.4.0] - 2026-08-17

### Added

- **`bitbank tax` サブコマンドを新設**（`events` / `reconcile` / `verify-report` /
  `pnl`）。bitbank 口座の取引を確定申告向けに整形する。出すのは「税務上の所得金額」
  ではなく **税計算用参考データ**で、申告要否・税額・所得区分の判定はしない。
  分析ロジックを CLI に置かない原則（ADR-002）の例外で、根拠は
  [ADR-004](docs/adr/004-tax-logic-in-cli-exception.md)（税務は「間違えられない」領域で、
  LLM に計算させられないため計算を CLI に閉じる）。**private GET のみで POST は
  絶対に叩かない**。ユーザー指定の CSV は読むだけで、書き出しも送信もしない
- 数値基盤として**厳密有理数**（`cli/tax/ratio.ts` / `ratio-decimal.ts`）を導入し、
  丸めは境界で 1 回だけに限定した（[ADR-005](docs/adr/005-tax-exact-rational-arithmetic.md)）。
  浮動小数点を経由しないため、集計順序で値が変わらない
- 損益計算エンジン（`cli/tax/engine/`）に**総平均法・移動平均法**を実装。
  既定は総平均法（移動平均法は税務署へ届出済みのユーザー向け）。不変条件 I1〜I4 と
  処分上限を検査し、国税庁 FAQ の設例（2-4 / 2-8）をゴールデンテストで固定している
- **参考損益の表示ガード**（`cli/tax/guard/reference-pnl.ts`）。(a) アテステーション
  （`--attest`）/ (b) 取得価額を未確定にするフラグの不在 / (c) 前年繰越の確定
  （`--carryover`）/ (d) 残高突合の一致 / 履歴が打ち切られていないこと、を**すべて
  満たした銘柄だけ**参考損益を数値で出し、満たさない銘柄は欄を出さずに `blocked_by` へ
  理由を並べる。ガードが守る範囲と唯一の対象外（`verify-report` の信用損益）は
  [ADR-006](docs/adr/006-reference-pnl-guard-scope.md)
- **年間取引報告書との突合** `bitbank tax verify-report`。bitbank 公式の CSV を
  現物（`--csv`）・信用（`--margin-csv`）の 2 様式で受け取り、API 側と項目ごとに
  突き合わせて `MATCH` / `FEE_ROUNDING` / `REPORT_EXCESS` / `API_EXCESS` に診断する。
  CLI が API から再現できない列（BTC 建て・貸出・年末建玉）は `unsupported` として
  分離し、差の解釈に混ぜない
- **販売所（即時売買）の取込** `--brokerage-csv`。販売所の取引は API に一切現れないため、
  UI の「売買履歴」CSV が唯一の取込経路になる。`events` / `reconcile` / `pnl` /
  `verify-report` の 4 本すべてで受け付ける
- **国税庁「暗号資産の計算書」互換モード**（`NTA_SHEET_2025_12`。
  `cli/tax/compat/nta-sheet.ts`）。既定の計算（内部非丸め）は変えず、レポートに
  `nta_compat` 欄を併記する。計算書へ手で書き写した場合と同じ値になるよう、
  総平均法は収入計を切捨て・必要経費計を切上げ、移動平均法は売却の都度
  残高価額を切上げる（既定とは**丸める場所が違う**ため 1 円ずれることがある）
- **課税方式パラメータ**（`cli/tax/taxation.ts`）。課税年度から課税方式を決め、
  `taxation.mode` / `certainty` / `basis` を出力する。方式が決まらない年は
  推測で数値を出さずエラーにする
- 税務の年分判定に使う **JST 年境界ヘルパー**（`cli/date-utils.ts` の `jstYear` /
  `jstYearRangeMs` / `jstIso`）。「JST は表示用のみ」規約の明示的な例外
- 生データ取得の網羅化: `trade-history` に `--all-pairs` / `--year`、
  `deposit-history` に `--all` / `--year`、`withdrawal-history` に `--all` /
  `--all-assets` / `--year` を追加。全ペア・全 asset を横断して年分を集める。
  `--max-pages` の上限に当たった場合は打ち切りを `meta.truncated` / `partial` で申告し、
  部分結果を黙って完全なものとして返さない（tax 側はこのとき参考損益をブロックする）
- **`tax-report` Skill**（`skills/tax-report/`）。CLI が計算した確定値だけを提示し、
  Skill 側では一切計算しない。免責（`disclaimers`）は要約せず全文を提示する
- npm 公開物に `cli/tax/` を含めた（`package.json` の `files`）。**この 1 行が無いと
  `npm pack` も CI も緑のまま公開物から tax が丸ごと欠け**、`bitbank tax` が実行時に
  `ERR_MODULE_NOT_FOUND` で落ちる
- ADR の採番手順 `.claude/rules/adr.md` を新設し、chaos `x21` で
  `docs/adr/` の不変条件（番号重複なし・ファイル名と見出しの番号一致・
  必須 4 節・ステータス語彙）を機械検証する。狙いは並行ブランチでの採番衝突で、
  同じ番号の ADR が別ファイル名で作られると git は競合を出さないため、
  main への push 時の CI が唯一の検出点になる（欠番は無害なので検査しない）
- **`bitbank balance-history`**。現在の残高から約定・入出金を逆算して各時点の保有を
  復元し、その日の 1day 足 open で評価する（計算本体は `cli/portfolio/`、根拠は
  [ADR-007](docs/adr/007-balance-history-reconstruction-in-cli.md)）。**private GET のみ**。
  純入出金は元本と出金手数料を分離し、単純増減と調整後増減（単純増減 − 純入出金）を
  併記する。履歴の打ち切りは `partial` / `meta.truncated` / `completeness` / `warnings`
  の 4 経路で申告する

### Fixed

- **リリース時のバージョン同期が plugin 配布経路に届いていなかった問題を修正**
  （`scripts/sync-version.ts` / `.github/workflows/release.yml` / `docs/dev/release.md`）。
  plugin manifest 5 種は npm tarball に入らず（`package.json` の `files` 対象外）、
  marketplace / plugin client が読むのは **git tag のツリー**。release workflow は
  tag が push された後に走るため、そこでの書き換えはどの配布物にも残っていなかった。
  **0.3.0 のリリース後も 5 種すべてが `0.2.0` を表示したままだった。**
  版上げを tag を切る前のローカル作業に移し、workflow 側は
  `sync-version.ts --check <tag>` で照合して不一致なら publish 前に落とす
- **`package.json` の version をプレースホルダ `0.0.0-dev` に固定**。実バージョンは
  publish 直前に `npm version <tag>` が注入する。実バージョンを手で書くと tag と
  一致して `npm version` が "Version not changed" で落ちる
  （姉妹リポ `bitbank-lab-mcp` の v0.4.0 で発生 →
  [#30](https://github.com/bitbankinc/bitbank-lab-mcp/pull/30) と同じ方針）。
  chaos `x23` が 2 系統（プレースホルダ / manifest 揃い）を検査する
- **`workflow_dispatch` からのリリースが tag 入力を無視していた問題を修正**
  （`.github/workflows/release.yml`）。`${GITHUB_REF_NAME:-inputs.tag}` は
  `GITHUB_REF_NAME` が常に非空（手動起動時はブランチ名）なので入力に落ちず、
  `VERSION=main` で `npm version` が失敗していた。`inputs.tag || ref_name` の順に修正
- **release workflow の shell 式展開を env 経由に変更**（template injection の遮断）。
  `workflow_dispatch` の `tag` は手入力で、`${{ }}` の展開はシェルがパースする**前**に
  起きるため、メタ文字を含む値で `run:` に任意コマンドを注入できた。`npm-publish` は
  `id-token: write` を持つので OIDC trusted publishing にも到達し得る。tag は
  workflow 全体の `env.RELEASE_TAG` に置き、`run:` からは `"$RELEASE_TAG"` で参照する
- **`workflow_dispatch` で checkout 対象と publish 対象の tag が食い違い得た問題を修正**。
  3 つの `actions/checkout` は起動時に選んだ ref を取るため、入力 tag と別のコードを
  その tag の npm package として publish できた。各 checkout に
  `ref: refs/tags/<tag>` を指定する。`refs/` で修飾するのは、**未修飾 ref では branch が
  tag より優先される**ため（`actions/checkout` の `getCheckoutInfo` は
  `branchExists(origin/<ref>)` を先に見る）。修飾しないと、tag と同名の branch を
  作るだけで「存在しない tag なら checkout が失敗する」ガードを迂回できてしまう
- **`portfolio` Skill の「JPY 建て資産推移」が誤読を生んでいた問題を修正**
  （`skills/portfolio/SKILL.md`）。旧実装は「**現在の保有量 × 過去の価格**」の近似を
  モデルに計算させるもので、入出金も売買も反映していなかった。積み立てている口座では
  過去の行が実残高から大きく乖離し、実機確認 #14 の追試で **口座の持ち主本人が
  「資産が半減した」と誤認しかけた**（誤読は例外条件ではなく普通の使い方で起きる）。
  **旧実装の出力を資産推移として信じていた場合、その過去の行は実残高ではない。**
  新実装は `bitbank balance-history` の復元結果をそのまま提示し、モデルは計算しない
  （月次ローソク足を取って掛け算する手順は削除）
- 資産推移の提示規律を明文化した。**単純増減・純入出金・調整後増減は必ず 3 つ揃えて
  出す**（「+50,000 円のうち 40,000 円は入金」が伝わらないと、入金を値上がりと
  誤認させる）。`warnings` / `assumptions` は要約・省略せずそのまま伝え、履歴が
  打ち切られているときは表より先に「復元値は信用できない」と明言する
- **注記義務の非対称を解消した。** 「復元値であること・最終点だけ実測であること」の
  明示は、これまで可視化節が**図にだけ**課しておりテキスト表側に規定が無かった。
  それが今回の穴の直接原因だったため、テキストにも同じ強度の義務を課し、注記は
  **表の前**に置くと定めた（旧実装の誤読は、注記が 20 行の表の後ろにあったために起きた）
- 標準チャート `portfolio.value-history` の図中注記を新しい前提へ更新した
  （`holdings fixed at current amounts` は**廃止**。復元ベースである旨・最終点のみ実測で
  ある旨・期間中の純入出金を必須注記にした）。チャート ID は変えていない
- `portfolio` Skill の提供機能から **`含み損益`** を外した。取得価額を持たないため
  計算できず、`balance-history` が入っても変わらない（あれが出すのは評価額の推移と
  入出金調整であって、取得原価ベースの損益ではない）。**トリガー「含み益ある？」は
  残し**、評価額と推移を出したうえで tax-report（`tax pnl` の参考損益）へ案内する
  応答を本文に規定した。`調整後増減` を含み損益と混同しない注意も入れている。
  同じ記述を持っていた `skills/INDEX.md` / `recipe-portfolio-review` /
  `recipe-pre-trade-check` も揃えた

#### tax サブシステムの横断監査で見つかった 7 件（リリース前に修正済み）

サブシステム全体を 1 つの系として見る監査を行い、**個々の変更は正しいが組み合わせで
破れる**不変条件を洗い出した。以下はいずれも**誤った数値が警告なく出る**か、
**その一歩手前**の経路である。

- **`--carryover=zero` を全履歴で反証するようにした**（`cli/tax/report/run.ts` /
  `guard/reference-pnl.ts`）。前年に入庫のみがある銘柄で `--carryover=zero` を使うと、
  当年イベントにブロックフラグが立たず（(b) は当年スコープ）、残高突合も入庫を数量に
  含めたまま MATCH するため、**入庫分を母集団から落とした平均単価がガード (a)〜(d) を
  すべて通過して数値で出ていた**。「当年が初年度」はユーザーの主張であると同時に
  **CLI が全履歴で反証できる事実主張**なので、前年以前に同一銘柄のイベントがあれば
  ゼロ確定の繰越として埋めず (c) が理由付きで止める。明示の `--carryover` ファイルは
  従来どおり通す（中身の正しさは機械で反証できず、それを受けるのが (c) の意味）。
  (c) の文言は「繰越を書き忘れた」と「zero と書いたが反証された」で分けた
  （利用者の次の行動が違うため）。ADR-006 に別軸の判定として追記
- **繰越 JSON の資産キーを `canonicalAsset` で正規化するようにした**
  （`cli/tax/carryover.ts`）。繰越だけが `toLowerCase` で名寄せ（付録E.5）を通って
  おらず、旧シンボルで `matic` と書いた繰越は `pol` のイベントと結び付かなかった。
  実体のある `pol` は (c) 未確定でブロックされる一方、`matic` は突合行を持たないまま
  **「取引ゼロ・期末＝繰越」の参考欄だけを出す幽霊行**になっていた。
  名寄せ後の衝突検出は従来どおり効くので `matic` と `pol` の併記は明示エラーになる
- **同一ミリ秒のタイブレークを約定 ID の数値順に統一した**（`cli/tax/sort-order.ts` へ集約）。
  4 箇所とも素の `localeCompare` で `"10:0" < "9:0"` という辞書順になっており、
  取得側（数値順）と**リポジトリ内に 2 つの順序定義が併存**していた。移動平均法は
  時系列順が結果を変えるため、同一ミリ秒に取得と処分が混ざると譲渡原価が入れ替わる。
  数値順は `Number()` 化せず「桁数 → 辞書順」で決める（販売所の注文 ID は任意長で
  2^53 を超え得るため）。総平均法は順序非依存なので影響しない
- **順序を定義できない異ソース同時刻を違反として止めるようにした**
  （`cli/tax/engine/order-ambiguity.ts`）。取引所の `trade_id` と販売所の注文 ID は
  別の ID 空間で数値の大小に意味が無く、販売所 CSV の日時は秒精度なので**秒未満の
  前後関係は原理的に復元できない**。止めるのは順序が結果を変える組み合わせだけ
  （同一 `ts_utc` × 異 ID 空間 × 同一銘柄で取得と処分が混在）に限定し、可換な
  取得どうし・処分どうしは誤ブロックしない。検出は `violations` に積む
  （`pending` では `evaluateGuard` が見ず参考損益が止まらないため）
- **信用の未観測形状を fail-closed にした**（`cli/tax/ledger/margin-entries.ts` /
  `import/to-events-margin.ts`）。2 経路が無言で通っていた。(1) `MARGIN_CLOSE` なのに
  `realized_net` が無いと空配列が返り、**その決済の差益・差損・手数料が income /
  expense / reference_pnl から消えていた**（`verify-report` は同じ欠落を警告に出して
  いたので `pnl` 側だけが沈黙していた）。理由付きで `deferred` に回す。
  (2) 建玉 open 行に `profit_loss` が乗る形状を検知しておらず、新規／決済の判定か
  API 形状が想定と違うときその損益がどこにも計上されずに消えていた。観測形状では
  open は `"0"` なので、非ゼロなら `UNOBSERVED_SHAPE` を立てて銘柄ごとブロックする
  （読めない値も「ゼロと確認できない」側に倒す）
- **互換モードの移動平均を行ごとに円確定するようにした**
  （`cli/tax/compat/moving-average-sheet.ts` を分離）。国税庁計算書は繰越価額・購入価額が
  **整数円入力である前提**で組まれている（付録D.5 / D.3）。販売所は約定代金の列が無く
  `数量 × 指値価格` で出すため小数円になり、そのまま漸化式へ入れると `nta_compat` が
  「計算書に書いたらこうなる」値でなくなっていた。シートへ入れる金額を HALF_UP で
  円に確定してから回す（丸めモードは翌年 B 欄への転記に揃えた）。**既定エンジンは
  変えない**（ADR-005: 内部非丸め）。整数円入力では挙動が変わらないため、取引所だけの
  口座は無影響。注記は移動平均法のレポートにだけ載せる
- **不変条件 I4（互換モードの丸め起因の乖離額）を実装した**（`nta_compat.delta` に 4 欄）。
  要求仕様 §3 の I4「Excel 互換モード有効時のみ丸め起因の I1 乖離を許容し、乖離額を
  レポートに明示」が未実装で、設計文書と実態が食い違っていた。I4 は違反ではなく
  **開示**なので検出側ではなく出力に出す。向きは「既定 − 互換」。差が無い欄も 0 として
  残す（差が無いこと自体が情報）。総平均法では必要経費計に、移動平均法では譲渡原価に
  差が出るため 4 欄すべてを出す。**スキーマ変更のため `agents/` を再生成した**

## [0.3.0] - 2026-07-17

### Added

- 分析系 Skill に可視化（グラフ出力）レイヤーを追加。共有規約
  `skills/_shared/references/visualization-guide.md`（opt-in トリガー・
  matplotlib 解決手順・出力先/ファイル名（UTC 統一）・スタイル・来歴フッター・
  安全規律）を単一ソースとし、7 skill（backtest / signal-explorer /
  correlation-analysis / volatility-profile / portfolio / indicator-analysis /
  paper-trade）に標準チャート計 22 種を安定 ID
  （例: `backtest.equity-drawdown`、`correlation-analysis.heatmap`）付きで定義。
  recipe 2 本は構成 skill の標準チャートを参照する。
  可視化はデフォルト off（opt-in）でテキスト出力を置き換えない
- 機械可読チャートカタログ `agents/chart-catalog.json` を追加。
  `scripts/gen-agents-catalog.ts` が SKILL.md の可視化表から自動生成する
  （手書き禁止、chaos `x17` が drift を検査）
- chaos `s11` を新設: 可視化節を持つ skill の共有ガイド参照、チャート ID の
  prefix 一致・グローバル一意性を検査する

### Changed

- backtest skill の手数料文言を「実行時取得」前提に刷新。レートはペアごとに
  異なり campaign で無料化もあるため、学習知識・他ペアの数字を使い回さず
  `bitbank pairs` から毎回取得する旨に変更。具体的なレートは SKILL.md に
  書かず、公式ガイドへのリンクと `cli/fees.ts` の `DEFAULT_TAKER_FEE_RATE`
  を単一ソースにする（ドキュメント内の数字が新たなハードコード源になるのを防ぐ）

## [0.2.1] - 2026-07-15

### Fixed

- `meta.request.command` が実行した CLI コマンド名ではなくハンドラ実装
  ファイル名でラベルされていた不整合を修正（`trade-history` が
  `trade-history-all`、`tickers-jpy` が `tickers` と表示されていた。
  表示ラベルのみの問題でデータへの影響なし）。router が解決したコマンド名を
  `RuntimeContext.command` で伝搬し、ラベルの単一ソースにする (#13)

### Changed

- リリースワークフローを `bitbank-lab-mcp` に揃えた。（←既存の記述をそのまま移動）

### Added

- README: Cursor 節を拡充。（←既存の記述をそのまま移動）

## [0.1.5] - 2026-07-05

> 0.1.4 は npm 未公開の欠番（release workflow の npm pin 問題でリリース中止。
> 修正後 0.1.5 として公開）。

### Added

- 全 SKILL.md の frontmatter に機械可読なバイナリ依存宣言
  `metadata.requires.bins: [bitbank]` を追加。
  chaos `s10` が全 skill の宣言と compatibility 文言（CLI 別途インストールの明記）を検査する
- `skills/_shared/references/cli-conventions.md` に「起動方法の解決手順」を新設。
  `command -v bitbank` → repo checkout なら `npx tsx cli/index.ts` → どちらも無ければ
  `npm i -g bitbank-lab-cli` を案内して停止、の 3 段で解決する。plugin cache 内の
  `bin/bitbank` / `cli/index.ts` は依存を含まず実行不可であることを明記
  （Codex plugin 実機フィードバックで `command not found: bitbank` →
  `Cannot find module 'tsx/cli'` の詰まりが確認されたため）

- README を再構成: 冒頭に「前提条件」セクションを新設（Node.js 22+ / npm / 対応 OS /
  macOS の Xcode Command Line Tools 注記）。Plugin 節に「CLI 本体」と「Plugin 登録」の
  2 レイヤー整理表を追加し、CLI 本体が全ケースで必須という依存関係を明記

### Changed

- `bin/bitbank`: `tsx` を解決できない環境（plugin cache 等、`node_modules` なし）で
  生のスタックトレースではなく、`npm i -g bitbank-lab-cli` / `npm ci` への
  誘導メッセージを stderr に出して exit 1 するようにした

- 必要 Node.js を 20 以上 → **22 以上**に引き上げ（`engines` / `.nvmrc` / README /
  各 SKILL.md の compatibility を同期）。Node.js 20 は 2026-04-30 に EOL 済みのため。
  姉妹リポ bitbank-lab-mcp（Node 22+）とも要件が揃う。Node 20 環境では
  `npm i -g` 時に engines 警告が出るようになる（0.x につき SemVer 慣習の範囲内）

- `package.json` の `repository.url` を publish 実行元（tjackiet）に一時的に戻した。
  `npm publish --provenance` が package.json の repository と CI 実行リポジトリの
  一致を検証するため。公式 org（bitbankinc）への npm オーナートランスファー完了時に戻す
  （README / homepage / bugs の導線は bitbankinc のまま）

### Fixed

- README の Codex CLI プラグイン導入コマンドを実在するフローに修正
  （誤: `codex plugin install <owner>/<repo>` → 正: `codex plugin marketplace add`
  → `codex plugin list` で名前確認 → `codex plugin add <plugin>@<marketplace>`）
- 依存の transitive 脆弱性 5 件（high 3 / low 2: `ws` / `form-data` / `esbuild` /
  `@babel/core`）を `npm audit fix`（semver 互換更新）で解消
- release workflow の npm を 11.5.1 → 11.18.0 に固定。11.5.1 は `.npmrc` の
  `min-release-age`（npm >= 11.10）を知らず stderr 警告で E2E を壊していた

## [0.1.3] - 2026-06-10

### Added

- 機械可読カタログ `agents/tool-catalog.json` / `agents/error-catalog.json` を追加。
  `scripts/gen-agents-catalog.ts` が単一ソース（`cli/commands/schema` の `ALL_SCHEMAS`、
  `cli/commands/trade/confirm-guard.ts` の `CONFIRM_PHRASES`、`cli/error-codes.ts`、
  `cli/exit-codes.ts`）から生成する。LLM が CLI を実行せず repo を読むだけで、全コマンド・
  パラメータ（JSON Schema）・出力形・`dangerous`/`confirm` 安全フラグ・エラーコード分類と
  retry 指針を把握できる（kraken-cli の `agents/*.json` 流のカタログ）。
  - 手書き禁止: `cli/__tests__/chaos/conventions/x17-agents-catalog-drift.test.ts` が
    regenerate して committed との差分ゼロを検査し、コマンド追加・エラーコード変更時の
    取り込み漏れを CI で止める。
  - `package.json` の `files` に `agents/` を追加し npm 配布物へ同梱。
  - `npm version <bump>` の `scripts.version` フックが両カタログを再生成・ステージし、
    `cli_version`（`package.json` の version 由来）の同期漏れ＝version bump 時の
    ドリフトを防ぐ。
  - `agents/*.json` は plugin の subagent 検出（`agents/*.md`）と拡張子が異なり衝突しない。

### Breaking Changes

- 全コマンドの数値フィールドを CLI 出力時に `string` → `number` に正規化。
  `cli/schema-helpers.ts` の `numStr` / `nullableNumStr` で防御的に変換し、
  空文字・`NaN`・`Infinity` は parse error として弾く。Skill / 呼び出し側で
  `Number(...)` / `parseFloat(...)` を挟む必要がなくなる。
  - 対象コマンド: `depth`, `circuit-break`, `status`, `pairs`,
    `assets`, `trade-history`, `trade-history-all`, `margin-status`,
    `margin-positions`, `deposit-history`, `withdrawal-history`,
    `unconfirmed-deposits`, `active-orders`, `order`, `orders-info`,
    `trade create-order`, `trade cancel-order`, `trade cancel-orders`
  - 主なフィールド: 価格系（`price`, `average_price`, `*_trigger_price` 等）、
    数量系（`amount`, `start_amount`, `remaining_amount`, `executed_amount`,
    `unit_amount`, `*_max_amount`, `min_amount`, `free_amount`,
    `locked_amount`, `onhand_amount`, `withdrawing_amount`）、
    手数料・レート系（`maker_fee_rate_base_quote`, `taker_fee_rate_base_quote`,
    `fee_amount_base`, `fee_amount_quote`, `fee`, `margin_rate`,
    `force_close_rate`）、PnL 系（`open_pnl`, `close_pnl`, `todays_pnl`,
    `total_assets_jpy`, `margin_used`, `margin_available`）。
  - 例: `assets` の `free_amount` は `"0.001"` → `0.001`、
    `depth` の `asks: [["100","1.0"]]` → `[[100, 1.0]]`、
    `margin-status` の `margin_rate: "300.00"` → `300`（null はそのまま null）。
  - スコープ外: `cli/watch/format.ts` の WS TickerDataSchema（Wave 5 PR #9 で対応）、
    `cli/paper-state.ts`（ローカル state で既に `z.number()` 使用）。
  - 新規規約テスト `cli/__tests__/chaos/conventions/x14-numeric-field-typing.test.ts`
    が「数値らしいフィールドが `z.string()` のまま」になっていないか継続検査する。
- `trade withdraw` コマンドを削除。出金機能は bitbank Web UI / アプリで行うこと。
  関連して `cli/withdrawal-allowlist.ts` および
  `~/.bitbank/withdrawal-allowlist.json` も削除（allowlist は withdraw 専用だったため）。
  セキュリティ強化の一環。
- `trade withdraw` の出金先指定方法を変更。`--uuid=<UUID>` を **廃止** し、
  `--to=<bitbank ラベル>` を必須化。あわせてローカル allowlist
  (`~/.bitbank/withdrawal-allowlist.json`) を導入し、allowlist に登録された
  ラベルしか出金できなくなる。
  - 動機: bitbank の API キーが流出した場合、登録済み出金先 UUID 全体に対して
    等しく送金可能になる穴があり、混乱した AI エージェントが
    `withdrawal-accounts` から拾った UUID を `trade withdraw` に投げる経路を
    塞ぐ必要があった
  - 設計: allowlist はラベル文字列のみ保持し UUID は持たない。
    実 UUID は実行時に `GET /user/withdrawal_account` で動的解決するため、
    ローカルファイル改ざんで攻撃者 UUID を捏造することは不可能
  - 移行: `~/.bitbank/withdrawal-allowlist.json` を mode 0600 で作成し、
    `{ "version": 1, "labels": ["<bitbank Web UI で登録したラベル>"] }`
    の形式で記述する。詳細は `.claude/rules/trading-safety.md`
- API エラーコード `60001` の取り扱いを訂正。公式 errors.md と突き合わせた
  結果、これは "Insufficient amount"（残高不足）であり、レート制限ではない
  ことが判明したため:
  - エラーメッセージを「レート制限」→「残高不足」に変更
  - `apiErrorExitCode(60001)` の戻り値を `EXIT.RATE_LIMIT (3)` →
    `EXIT.GENERAL (1)` に変更
  - `cli/http-core.ts` における 60001 受信時の自動リトライを廃止
    （残高不足はリトライしても解決しないため）
  60001 の exit code に依存していた呼び出し側がある場合は要見直し。
  本物のレート制限は HTTP 429 で返るため、こちらは従来通り `shouldRetry` で
  リトライ・`EXIT.RATE_LIMIT` で分類される。
- API エラーコード `10009`（"You sent requests too frequently. Retry later."）
  を新規ハンドル。`apiErrorExitCode(10009)` は `EXIT.RATE_LIMIT` を返す。
  ただし HTTP 429 と異なり自動リトライ対象にはしない（公式は HTTP 429 を
  プライマリ rate-limit パスとしているため）。
- 公式 errors.md と整合させるため、以下のエラーコードの和訳を訂正:
  `20003`「APIキー権限不足」→「ACCESS-KEY が見つかりません」、
  `30001`「注文数量不正」→「order-quantity 未指定」、
  `30006`「注文数量下限」→「order-id 未指定」、
  `30007`「注文数量上限」→「order-id 配列未指定」、
  `30012`「残高不足」→「order-price 未指定」、
  `40001`「不正なパラメータ」→「order-quantity が不正」、
  `50009`「注文不可（サーキットブレーカー）」→「注文が見つかりません」。
  あわせて `30009`「asset 未指定」を新規追加。
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

## [0.1.0] - 2026-05-08 〜 [0.1.2] - 2026-05-09

プロトタイプ期。Public / Private / Trade / Paper / Profile コマンド一式、
Agent Skills 12 本、CI / Release / Security workflow の初期投入。
詳細は git log および GitHub Releases を参照。

> **履歴 provenance:** リポジトリ公開にあたり、それ以前の private 開発履歴は
> squash 済み。このため `git log` / `git blame` は root コミットより前を遡れない。
> `git rev-list --max-parents=0 origin/main` で確認できる root は 3 つ
> （`5ade51a` "fix(date): …" = 324 ファイル / `16b3691` "fix(candles): …" = 323 ファイル /
> `c2fc466` "Merge pull request #215 …" = 323 ファイル、いずれも 2026-05-25）で、
> メッセージに反して実体は初期一括 import。
> 公開以前の設計意図・経緯は [`docs/adr/`](docs/adr/) を参照。
