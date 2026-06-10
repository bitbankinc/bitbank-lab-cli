# 依存クールダウン（サプライチェーン対策）

公開直後の npm パッケージ / GitHub Actions バージョンを自動で取り込まないための
二層ガード。2026-03 の axios 侵害対応メモに基づき導入（MCP リポと同一方針）。
悪意あるバージョンは公開後数日以内に検知・unpublish されることが多いため、
「公開から 7 日待つ」だけで自動取り込みリスクの大半を回避できる。

## レイヤ構成

| レイヤ | 設定 | 効く場面 | 効かない場面 |
|---|---|---|---|
| `.npmrc` の `min-release-age=7` | リポジトリルート [.npmrc](../../.npmrc) | ローカルでの `npm install` / `npm update` / `npm install <pkg>` | `npm ci`（lockfile 厳密再現のため対象外）、npm < 11.10 |
| Dependabot `cooldown` | [.github/dependabot.yml](../../.github/dependabot.yml) | 週次の npm version update PR（7 日 / major は 14 日） | security update（CVE 起因の PR は対象外で即時。設計どおり）、github-actions エコシステム（cooldown 未サポートのため付けない） |

両方が必要な理由: Dependabot は `.npmrc` の `min-release-age` を読まない。
逆に `.npmrc` は Dependabot の PR 生成に影響しない。それぞれ独立に設定する。

## 注意点

- **`min-release-age` は npm >= 11.10 が必須**。それ未満の npm は黙って無視する
  （エラーにならないため「効いてるつもり」になりやすい）。Node 22 同梱の npm は
  10.x なので、ローカルで効かせるには `npm i -g npm@^11.10` が必要
- **確認は `npm config get before` で行う**。npm 11.10+ は `min-release-age` を
  内部で `before` に変換するため、`npm config get min-release-age` は `null` を
  返しうる
- **`npm ci` はクールダウンの対象外**（lockfile を厳密に再現するだけで新バージョン
  解決をしない）。CI は非破壊なので壊れないが、守りどころはローカルの
  install / update と Dependabot PR の二箇所
- **security update は即時**。GitHub の Dependabot security updates は
  `dependabot.yml` の cooldown と別系統で、critical / high の patch PR を
  クールダウンなしで出す（[repo-security.md](repo-security.md) 参照）。
  これは意図した挙動（CVE 対応を 7 日遅らせない）

## 緊急バイパス手順

クールダウン中のバージョンを今すぐ入れる必要がある場合
（例: 重大バグ修正が含まれる、依存先が古いバージョンを unpublish した）:

```bash
# 一時的にクールダウンを無効化して特定パッケージのみ更新
npm install <pkg>@<version> --min-release-age=0
```

- バイパスは**特定パッケージ・特定バージョンに限定**する
  （`.npmrc` 自体の変更・削除はしない）
- バイパスした更新を含む PR の description に
  **「なぜ 7 日待たないか」の根拠を必ず明記**する
  （例: 該当バージョンの公開日・変更内容・確認した供給元の情報）
- Dependabot PR を待たず手動更新した場合も同様にバイパス扱いとして記録する
