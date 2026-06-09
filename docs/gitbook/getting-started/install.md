---
description: bitbank CLI のインストール方法。npm でのグローバルインストール、お試し実行、クローンしての開発用セットアップまでを順に説明します。
---

# インストール

bitbank CLI は **Node.js 20 以上**で動作します。Linux / macOS / Windows に対応しています。まだ Node.js を入れていない場合は、先に [Node.js 公式サイト](https://nodejs.org/) から LTS 版をインストールしてください。

{% hint style="info" %}
Node.js が入っているかは `node -v` で確認できます。`v20.x` 以上が表示されれば OK です。
{% endhint %}

## インストール方法を選ぶ

用途に応じて 3 つの方法があります。コマンドを叩くだけなら **A**、まず試すだけなら **B**、Skill を編集・開発したいなら **C** を選んでください。

{% tabs %}
{% tab title="A. npm でインストール（推奨）" %}

npm から `bitbank` コマンドをグローバルインストールするのがいちばん簡単です。

```bash
npm i -g bitbank-lab-cli
```

これで、どのディレクトリからでも `bitbank` コマンドが使えます。アンインストールは次のコマンドです。

```bash
npm uninstall -g bitbank-lab-cli
```

{% endtab %}

{% tab title="B. インストールせず試す" %}

試し叩きだけなら、`npx` でインストールなしに実行できます。

```bash
npx -y bitbank-lab-cli ticker btc_jpy
```

初回はパッケージのダウンロードが走るため、少し時間がかかります。

{% endtab %}

{% tab title="C. クローンして開発" %}

Skill を編集・カスタマイズしたい場合や、CLI の開発に参加したい場合は、リポジトリをクローンして `./install.sh` を実行します（内部で `npm ci` と `npm link` を行います）。

```bash
git clone https://github.com/tjackiet/bitbank-lab-cli.git
cd bitbank-lab-cli
./install.sh
```

{% endtab %}
{% endtabs %}

## 動作確認

インストールできたら、認証不要の Public コマンドで動作確認します。

```bash
bitbank ticker btc_jpy
bitbank candles btc_jpy --type=1day --format=table
```

価格やローソク足が表示されれば成功です。

{% hint style="success" %}
ここまで動けば準備完了です。次は [クイックスタート](quickstart.md) で基本的なコマンドを試してみましょう。口座情報や取引を扱う場合は [API キーの設定](api-keys.md) に進みます。
{% endhint %}

## フォールバック：`npx tsx` で直接実行する

`bitbank` コマンドが PATH に通っていない環境（クローンしたが `./install.sh` を使っていない等）では、`npx tsx cli/index.ts` で同じことができます。

```bash
npm ci
npx tsx cli/index.ts ticker btc_jpy
# Private API（.env を tsx に直接読ませる）
npx tsx --env-file=.env cli/index.ts assets
```

毎回 `npx tsx ...` を打つのが手間なら、`npm run` の短縮エイリアスも使えます（`--` 以降が CLI 引数）。

```bash
npm run cli -- ticker btc_jpy
# Private API（.env を読み込む版）
npm run cli:env -- assets
```

{% hint style="info" %}
本ドキュメント内のコマンド例は、すべて `bitbank` コマンドが PATH に通っている前提で書いています。フォールバック環境では `bitbank` を `npx tsx cli/index.ts` に、Private API は `npx tsx --env-file=.env cli/index.ts` に読み替えてください。
{% endhint %}

## Agent Skills を使いたい場合

Claude Code / Cursor などのエージェントから自然言語で操作したい場合は、CLI 本体（上記）に加えて Skill を読み込ませる必要があります。リポジトリを開くだけで自動トリガーされるほか、各エージェントの plugin システムからもインストールできます。詳しくは [Agent Skills](../guides/skills.md) を参照してください。
