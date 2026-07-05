# Skill 追加手順

## ディレクトリ構造

```
skills/
  _shared/
    references/
      bitbank-api-formats.md   # 全 Skill 共通の API レスポンス形式
      pair-classification.md   # 全 Skill 共通のペア分類（流動性・カテゴリ等）
      cli-conventions.md       # CLI 呼び出し規約（--format=json / Result パターン等）
  <skill-name>/
    SKILL.md                   # Skill 定義（必須）
    references/                # ドメイン固有の参照資料（任意）
      <domain-specific>.md
```

## SKILL.md テンプレート

```markdown
---
name: <skill-name>
description: |
  Skill の説明。何ができるか、どんなリクエストに対応するか。
  トリガーとなるユーザーの発話例も含める。
compatibility: |
  Requires bitbank CLI (npx tsx cli/index.ts). Node.js 22+.
metadata:
  author: bitbank-aiforge
  version: "1.0"
---

# <Skill 名> Skill

## 実行フロー

（Plan → Validate → Execute の流れを記述）

## Gotchas

（注意点・落とし穴を列挙）
```

## references/ の規約

- 共通資料（`bitbank-api-formats.md`、`pair-classification.md` 等）は
  `skills/_shared/references/` に集約する。各 Skill 配下にコピーしない
- SKILL.md から共通資料を参照するときは
  `_shared/references/<file>.md` というパスで明示的に書く
- ドメイン固有の資料は `<skill>/references/<domain>-guide.md` や
  `<domain>-patterns.md` で命名
- CLI コマンドの実行例を含め、モデルが正確にコマンドを組み立てられるようにする

## Recipe Skill

複数の skill を順に呼び出して一連のワークフローにまとめるものを recipe と呼ぶ。
通常の skill と区別するための慣習を以下に定める。

### 命名

- ディレクトリ名・`name` ともに `recipe-<目的>` プレフィックスを付ける
  （例: `recipe-pre-trade-check`）
- 配置先は通常の skill と同じ `skills/<name>/`。recipe 専用ディレクトリは作らない

### フロントマター

```yaml
metadata:
  author: bitbank-aiforge
  version: "1.0"
  recipe: true
  requires:
    skills:
      - <呼び出す skill 名>
      - ...
```

- `metadata.recipe: true` で recipe であることを明示
- `metadata.requires.skills` に依存する skill を列挙する。順序は実行順に揃える

### 設計原則

- **recipe 自体は計算をしない**。各 step で「対応する skill の指示に従う」と書き、
  数値計算や指標ロジックは個別 skill に委ねる
- **step の順序と省略可否を明記**する。実行コストが高い step は条件付きで
  スキップ可能と書いておく（例: `data-verification` は通常相場ではスキップ可）
- **出力は各 skill の出力をそのまま並べない**。recipe 用のサマリーフォーマット
  （セクション + 総合判断ブロック）を SKILL.md 内に明示する
- **総合判断は機械的に出さない**。矛盾があれば「判断保留」として根拠を示す
  ルールも書く

### description のトリガー

- 個別 skill ではなく「全体を束ねたい」発話で起動するように書く
  （例: 「買う前にチェックして」「ざっと全体見て」）
- 個別 skill のトリガー語と被らせない。被ると recipe が暴発したり、逆に
  単一 skill で済む場面で recipe が選ばれて冗長になる

## 注意

- Skill に分析ロジックのコードは書かない（CLAUDE.md 禁止事項 1）
- Skill はモデルへの指示書。実行はモデルが CLI を呼び出して行う
