---
description: Private API・Trade コマンドで使う bitbank API キーの設定方法。推奨のプロファイル登録と、後方互換の .env 方式、secret の安全な取り扱いを説明します。
---

# API キーの設定

API キーが必要なのは、**口座情報の読み取り（Private）** と **資金操作（Trade）** だけです。ticker や candles などの Public コマンド、仮想資金の Paper コマンドは API キー不要で使えます。

{% hint style="danger" %}
**API キー・シークレットは絶対に公開しないでください。** チャット欄・公開リポジトリ・スクリーンショットなど、第三者が見られる場所に貼り付けないこと。漏洩した場合は速やかに bitbank の管理画面でキーを失効させてください。
{% endhint %}

API キーは bitbank の管理画面（API 設定）で発行します。発行時に**権限**（資産参照・注文・出金など）を選べます。読み取りだけのキーには注文・出金の権限を付けないなど、用途に応じて最小権限で発行するのがおすすめです。

## 推奨：`bitbank profile add` で登録する

プロファイル方式は、複数の API キーを名前付きで登録し、`--profile=<name>` で切り替えて使う仕組みです。secret はファイルに **0600** で安全に保存され、`process.env` を汚しません。

```bash
bitbank profile add main
# API key を貼り付け（または BITBANK_API_KEY env から自動採用）
# API secret は対話で hidden 入力（画面に出ない）
```

`profiles.json` は `$XDG_CONFIG_HOME/bitbank/profiles.json`（未設定時は `~/.bitbank/profiles.json`）にパーミッション **0600** で保存されます。

登録後は、次のように使えます。

```bash
bitbank profile list                  # 登録済みプロファイル一覧（secret は出ない）
bitbank profile show main             # 詳細（secret は **** マスク）
bitbank profile set-default main      # default を切り替え
bitbank assets                        # default プロファイルで実行
bitbank --profile=sub assets          # サブ口座で実行
bitbank profile remove sub --confirm  # 削除（--confirm 必須）
```

{% hint style="info" %}
複数アカウント（メイン / サブ / read-only 検証用 など）を `bitbank --profile=<name> <cmd>` で切り替えられます。監視には読み取り専用キー、取引には取引用キーを使い分けると、誤操作の被害を局所化できます。
{% endhint %}

## 後方互換：`.env` 方式

プロファイルを 1 つも登録していない環境では、従来どおり環境変数からも読めます。

```bash
cp .env.example .env
# .env を編集して BITBANK_API_KEY / BITBANK_API_SECRET を設定
set -a; source .env; set +a
bitbank assets
```

`set -a` 以降は `source` で読まれた変数が自動的に export されます（`set +a` で戻す）。bash / zsh で動作します。CI 環境など、プロファイルを使いにくい場面のフォールバックに向いています。

{% hint style="warning" %}
`.env` は `.gitignore` 済みですが、誤ってコミットしないよう注意してください。`profiles.json` はリポジトリ外（`~/.bitbank/`）に保存されるため、リポジトリには含まれません。
{% endhint %}

## 認証情報の解決順序

`--profile` を指定しなかった場合、CLI は次の優先順位で認証情報を解決します。

1. `--profile=<name>` フラグ
2. `BITBANK_PROFILE` 環境変数
3. default プロファイル
4. レガシー環境変数（`BITBANK_API_KEY` / `BITBANK_API_SECRET`）

## secret の取り扱いポリシー

24/7 で取引 API を握る運用（bot 等）では、secret 漏洩のコストが大きくなります。最低限、以下を守ってください。

* **secret は CLI フラグで渡さない。** shell 履歴や `ps` 出力に平文が残るため、`--api-secret=...` のようなフラグは実装していません。env か対話 hidden 入力のみです。
* **取引用と読み取り用でプロファイルを分ける。** 監視には read-only キー、取引には取引用キーを別プロファイルにすると誤爆が局所化できます。
* **外部 secret manager を使う場合**は、ラッパで `BITBANK_API_KEY` / `BITBANK_API_SECRET` を env に注入してから `bitbank` を起動すれば動きます。CLI は env 経路を受けるだけで、特定ツールには依存しません。

## 動作確認

```bash
bitbank assets --format=table
```

保有資産が表示されれば、認証は成功です。エラーが出る場合は [トラブルシューティング](../reference/troubleshooting.md) を参照してください。

実際の取引（注文・キャンセル）に進む前に、必ず [取引と安全ガード](../guides/trading.md) を読んでください。
