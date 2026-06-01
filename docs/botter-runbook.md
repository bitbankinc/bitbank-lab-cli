# botter 運用 Runbook（read-only → paper → dry-run → 本番）

bot で 24/7 取引を回す前に通すべき手順を、**既存の安全機構を 1 本につないだ運用フロー**として
まとめたドキュメント。

> [!IMPORTANT]
> このドキュメントは**手順書**であり、新しい計算ロジックやコマンドは一切導入しない。
> 各コマンドの仕様の単一ソースは以下のリンク先（README / `.claude/rules/`）にある。
> 挙動が食い違ったときはリンク先を正とすること。
>
> 利用は自己責任。先に [⚠️ 免責事項](../README.md#免責事項) を読むこと。

## 全体像

read-only での確認から始め、仮想資金 → ドライラン → 本番と、影響範囲を一段ずつ広げる。
各段には **次の段へ進む条件** がある。条件を満たさないうちは次に進まない。

| 段階 | 目的 | 実 API の影響 | 次へ進む条件（要約） |
|---|---|---|---|
| 1. read-only profile | 監視・確認用の最小権限キーを用意 | 読み取りのみ | `--profile` で残高が読め、secret が平文で残っていない |
| 2. paper で練習 | 仮想資金で戦略を回す | public ticker / 1m candles のみ | 戦略が paper 上で一通り回り、発注サイズ・価格の出し方が固まった |
| 3. dry-run で確認 | 本番と同じ引数で送信内容を目視 | **叩かない** | dry-run の body が意図と完全一致し、confirm フレーズを把握した |
| 4. 本番 | 実発注 | POST（資金が動く） | 実行後に `active-orders` / `trade-history` / `assets` で結果を確認 |

---

## 段階 1: read-only profile を作る

監視・残高確認には、**bitbank 側で最小権限（資産・注文の参照のみ。出金・新規注文の権限を付けない）
で発行した API キー**を使う。読み取り専用かどうかは bitbank の API 設定画面で決まる値であり、
CLI 側では強制できない。CLI は受け取ったキーを安全に保管するだけ。

```bash
# bitbank の管理画面で read-only 権限の API キーを発行してから登録する
bitbank profile add readonly
# API key を貼り付け（または BITBANK_API_KEY env から自動採用）
# API secret は対話で hidden 入力（画面に出ない）

bitbank profile list                 # 登録確認（secret は出ない）
bitbank profile show readonly        # 詳細（secret は **** マスク）
bitbank --profile=readonly assets    # 残高が読めることを確認
```

CLI 側の保証（詳細は [README セットアップ](../README.md#セットアップ)）:

- `profiles.json` は `~/.bitbank/`（または `$XDG_CONFIG_HOME/bitbank/`）に **0600** で保存
- **secret は flag で渡せない**。`--api-secret=...` は実装しておらず、env か対話 hidden 入力のみ
  （shell 履歴・`ps` 出力に平文を残さないため）
- 本番で trade に使うキーは、この read-only profile とは**別 profile**（trade 権限付き）に分ける。
  監視は read-only、発注は trade 用と使い分けると誤爆の被害を局所化できる

> [!TIP]
> ✅ **段階 2 へ進む条件**
> - bitbank 側で最小権限のキーを発行した（出金・新規注文の権限を付けていない）
> - `bitbank --profile=readonly assets` で残高が読める
> - `bitbank profile show readonly` で secret が `****` マスクされ、shell 履歴に平文が残っていない
> - 本番で trade を行うなら、trade 権限付きキーを別 profile に分ける方針を決めた

---

## 段階 2: paper で戦略を練習する

仮想資金 × ライブ価格のシミュレーションで戦略を回す。**実 API は public ticker と 1m candles
のみ**を叩き、private / trade エンドポイントには一切触れない。状態は
`~/.bitbank/paper-state.json`（または `$XDG_DATA_HOME/bitbank/paper-state.json`）にローカル保存される。

```bash
bitbank paper init --jpy=1000000                                              # 仮想口座を初期化
bitbank paper create-order --pair=btc_jpy --side=buy --type=market --amount=0.001
bitbank paper create-order --pair=btc_jpy --side=buy --type=limit --price=10000000 --amount=0.001
bitbank paper tick                  # 直前 tick 以降の 1m 足で指値 fill を解決
bitbank paper assets                # 仮想残高（available / locked / total）
bitbank paper pnl --pair=btc_jpy    # 損益サマリ（realized + unrealized）
```

詳細は [README Paper セクション](../README.md#paperペーパートレード--仮想資金) を参照。

> [!TIP]
> ✅ **段階 3 へ進む条件**
> - 戦略の発注ロジックが paper 上で一通り回り、`paper pnl` が想定どおりに動く
> - 1 回あたりの発注サイズ（`--amount`）と価格（`--price`）の決め方が固まっている
> - 指値・成行・キャンセルの挙動を理解した（指値は GTC・部分約定なし・スリッページなし）

---

## 段階 3: trade をドライランで確認する

本番と**同じコマンド・同じ引数**を、`--execute` を付けずに実行する。これがドライランで、
**API は一切叩かない**。送信予定の内容（エンドポイント・ボディ）を目視で確認するための段階。

```bash
# --execute なし → ドライラン（cli/commands/trade/dry-run.ts が出力を生成）
bitbank trade create-order --pair=btc_jpy --side=buy --type=limit --price=9000000 --amount=0.001
```

出力（human 表示）はおおよそ次の形:

```text
🔍 DRY RUN（実際のAPIは叩きません）

リクエスト内容:
  エンドポイント: POST /v1/user/spot/order
  ボディ:
    pair: "btc_jpy"
    side: "buy"
    ...

実行するには --execute と --confirm=I-UNDERSTAND-CREATE-ORDER を付けてください:
  npx bitbank trade create-order ... --execute --confirm=I-UNDERSTAND-CREATE-ORDER
```

ボディ（pair / side / type / price / amount）が意図どおりかを 1 行ずつ確認する。
末尾の行に、本番実行に必要な `--execute` と `--confirm=<phrase>` が付いた完成形コマンドが出る。

> [!TIP]
> ✅ **段階 4 へ進む条件**
> - dry-run のボディが意図と**完全一致**している（ペア・売買方向・種別・価格・数量）
> - 末尾に表示された confirm フレーズを把握した
>   （`trade create-order` なら `I-UNDERSTAND-CREATE-ORDER`。一覧は
>   [`.claude/rules/trading-safety.md`](../.claude/rules/trading-safety.md) 参照）
> - 最初は最小ロットで始める前提でいる

---

## 段階 4: 本番（`--execute --confirm=<phrase>`）

二段確認をそろえて初めて実 POST に到達する。`--execute` 単独では POST に届かず、
コマンドごとの固定フレーズを `--confirm=<phrase>` で渡す必要がある。

```bash
bitbank trade create-order \
  --pair=btc_jpy --side=buy --type=limit --price=9000000 --amount=0.001 \
  --execute --confirm=I-UNDERSTAND-CREATE-ORDER
```

挙動マトリクス（`--confirm` 二段確認）:

| `--execute` | `--confirm=<correct>` | 結果 |
|:-:|:-:|---|
| なし | -（任意） | ドライラン |
| あり | なし | error（API を叩かない） |
| あり | 不一致 | error（API を叩かない） |
| あり | 一致 | 実 POST |

フレーズは `trade create-order` / `cancel-order` / `cancel-orders` / `confirm-deposits` /
`confirm-deposits-all` でそれぞれ異なる。単一ソースは
[`.claude/rules/trading-safety.md`](../.claude/rules/trading-safety.md) の「`--confirm` フラグ」表。

> [!WARNING]
> ⚠️ **POST は非冪等。失敗時は再送する前に必ず実状態を確認する**
>
> bitbank API は `Idempotency-Key` 相当のヘッダを受け付けない。POST はサーバ側で副作用が
> 発生し得るため、`cli/http-private-post.ts` は `retries: 0` と `retryOnNetworkError: false`
> を強制している。trade コマンドはタイムアウト・5xx・`ECONNRESET` 等でも**自動再送しない**。
>
> CLI が「失敗」を返しても、注文や出金が実際には通っている可能性がある（silent success）。
> タイムアウトや 5xx を受け取ったら、再実行する**前に**必ず次で実際の状態を確認すること:
>
> ```bash
> bitbank active-orders --pair=btc_jpy   # 注文が通っていないか
> bitbank trade-history --pair=btc_jpy   # 約定していないか
> bitbank assets                          # 残高が動いていないか
> ```
>
> 由来: [`.claude/rules/trading-safety.md`](../.claude/rules/trading-safety.md) 「POST のリトライ無効化（冪等性の保護）」

<!-- -->

> [!TIP]
> ✅ **本番を回し続ける条件（実行ごと）**
> - 1 回 POST するごとに `active-orders` / `trade-history` / `assets` で結果を確認する
> - タイムアウト・5xx が出たら、再送せずまず実状態を確認する（上記警告）
> - ロットは段階的にしか上げない。想定外の挙動が出たら段階 2〜3 に戻る

---

## 関連ドキュメント

- [README — Trade セクション](../README.md#trade資金操作--ドライランデフォルト) / [Paper](../README.md#paperペーパートレード--仮想資金) / [セットアップ](../README.md#セットアップ) / [コマンド一覧](../README.md#コマンド一覧)
- [`.claude/rules/trading-safety.md`](../.claude/rules/trading-safety.md) — `--execute` / `--confirm` ガード・POST 非冪等の単一ソース
- [`.claude/rules/commands.md`](../.claude/rules/commands.md) — コマンドのカテゴリ分類（public / private / trade / paper / profile）
