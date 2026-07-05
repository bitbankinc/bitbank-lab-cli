---
name: profile-management
description: |
  bitbank CLI の API キー切替プロファイル（`profiles.json`）の CRUD を
  提供する。複数アカウント（メイン / サブ / read-only 等）を切替えて使う。
  代表トリガー: 「API キー追加して」「profile 一覧」
  「default profile 切り替えて」「アカウント切り替えたい」
  注意: secret は flag では渡さず、対話 hidden 入力か
  `BITBANK_API_SECRET` env のみ。bitbank API 自体は叩かない。
compatibility: |
  Requires bitbank CLI (npx tsx cli/index.ts). Node.js 22+.
metadata:
  author: bitbank-aiforge
  version: "1.0"
---

# Profile Management Skill

`profiles.json` ベースの API キー切替（`--profile=<name>`）を管理する skill。
secret は対話プロンプトで hidden 入力する前提で、モデルが flag 経由で
渡そうとしないように注意する。

## いつ使うか

代表トリガー以外にも以下のような発話で起動する:

- 「サブ口座のキー登録」「メインに戻して」「キー削除」
- 「サブ口座のキーで残高見て」「main の secret 見せて」
- 曖昧形: 「キーの管理」

## 前提

- `profiles.json` の場所: `$XDG_CONFIG_HOME/bitbank/profiles.json` 優先、
  無ければ `~/.bitbank/profiles.json`
- 権限: 0600 強制（atomic write）
- 解決優先度: `--profile=<name>` flag → `BITBANK_PROFILE` env →
  default profile → legacy `BITBANK_API_KEY` / `BITBANK_API_SECRET` env vars

## 実行フロー

### Plan

1. ユーザー意図を以下のどれかに分類する:
   - 新規登録（add）
   - 一覧（list）
   - 詳細確認（show）
   - default 切替（set-default）
   - 削除（remove）
   - 別 profile での実行（`--profile=<name>` を private/trade コマンドに付加）

### Validate

- secret は **必ず対話で入力させる**。モデル側で値を flag に渡そうとしない
- profile 名は `[A-Za-z0-9._-]+`。先頭ドット禁止、`..` 禁止
- `remove` には `--confirm` が必須

### Execute

#### 新規プロファイル登録

```bash
# 対話: API key と API secret を聞かれる（secret は hidden 入力）
bitbank profile add main --format=json
# default にしたいとき
bitbank profile add main --default --format=json
# 説明を付ける
bitbank profile add sub --description="サブ口座 read-only" --format=json
```

**重要:** モデルからは絶対に `--api-secret=...` のような flag を作らない
（そんな flag は実装されていない）。`BITBANK_API_KEY` / `BITBANK_API_SECRET`
env vars が事前に export されていれば対話プロンプトはスキップされる。

#### 一覧

```bash
bitbank profile list --format=json --machine
# → data: [{ name, default, description }, ...]
# secret / key は出力されない
```

#### 詳細

```bash
bitbank profile show main --format=json --machine
# → data: { name, default, keyMasked, secretMasked, description, createdAt }
# secret / key は **** + 末尾 4 桁にマスクされる
```

#### default 切替

```bash
bitbank profile set-default sub --format=json --machine
```

#### 削除（--confirm 必須）

```bash
bitbank profile remove sub --confirm --format=json --machine
# default だった場合は default = null になる
```

#### 別 profile での実行

```bash
bitbank --profile=sub assets --format=json --machine
bitbank --profile=sub trade create-order ... --execute --confirm=I-UNDERSTAND-CREATE-ORDER
```

#### `--machine` を付けない例外: `profile add`

`profile add` は対話プロンプトで API key / secret を hidden 入力させる
**インタラクティブコマンド**。`--machine` は付けず、`--format=json` 単独
（または `--format=table`）で起動する。共通規約の例外として `cli-conventions.md`
にも記載済み。

## Gotchas

- **secret は flag 受け禁止**: `--api-secret=...` 等は実装されていない。
  shell 履歴に残るリスクを避けるため、env か対話 hidden 入力のみ
- **show の出力に secret は出ない**: `--format=json` でもマスクされる。
  「raw secret 見せて」と言われても、本 skill では出せない（profiles.json
  を直接 `cat` する場合は 0600 なので owner だけが読める）
- **後方互換**: profile を一度も登録していない環境では従来通り
  `BITBANK_API_KEY` / `BITBANK_API_SECRET` env vars が読まれる
- **`bitbank profiles`（複数形）は別物**: cwd 配下の `.env.<name>` ファイル
  を一覧する legacy コマンド。本 skill が扱うのは `bitbank profile`（単数形）
- **profiles.json は API を叩かない**: add 時にキー有効性検証は行わない。
  失敗は実コマンド（assets 等）実行時に返る
- **0600 でないと stderr に警告**: 既存ファイルの権限が緩いと警告が出るが
  実行は継続する。`chmod 600 ~/.bitbank/profiles.json` で対処
