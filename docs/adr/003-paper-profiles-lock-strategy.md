# ADR-003: ロック取得コアは共有し、sync / async sleep は統一しない

## ステータス

Accepted

## コンテキスト

`profiles.json`（`profiles-mutate.ts`）と `paper-state.json`（`paper-state-mutate.ts`）はどちらも load → mutate → save を O_EXCL ロックファイルで直列化している。`acquireLock` が両ファイルにコピペされ、63 行中 59 行が完全一致していた。差分は 4 点のみ（シグネチャ sync/async・エラーラベル・sleep 呼び出し）で、O_EXCL 取得・EEXIST 判定・stale 奪取（30s）・タイムアウト（5s）・TOCTOU コメントが丸ごと重複していた。片方のバグ修正が他方へ伝播せず、症状は lost update（状態破損）になり得た。共通化にあたり、待機時の sleep を sync / async どちらかへ統一すべきかの判断が必要になった。

## 決定

ロック取得の純粋なコア（1 試行ぶんの `tryAcquireOnce` と `ensureLockDir` / `safeUnlink` / `lockTimeout` / `backoffMs` / `STALE_LOCK_MS`）を `cli/lock-core.ts` に集約する。一方で sync / async sleep は**統一しない**。各 `*-mutate.ts` は while ループと自分の sleep 戦略だけを残す。

## 理由

- **profiles は直列 CLI 呼び出し。** 待機は sync sleep（`Atomics.wait`）が余計な microtask を挟まず event-loop に優しい。
- **paper は Skill / agent 経由で同一プロセス内 `Promise.all` 並行呼び出しが起き得る。** sync sleep だと待機側が event-loop をブロックし、lock 保持側の async I/O が進まず starvation する。よって async sleep が必須。
- **コアの一本化で二重実装と深ネスト（depth5 の try-catch 入れ子）を同時に解消できる。** バグ修正が片方に取り残されるリスクが消える。
- **観測挙動（5s timeout / 30s stale TTL）は現行一致を維持できる。** 振る舞い不変のリファクタに留められる。

## 影響

- sleep 戦略という「呼び出し文脈に依存する一点」だけが各 mutate に残る。統一を試みると profiles か paper のどちらかが上記の理由で劣化する。
- 取得コアの単体テスト（EEXIST retry / stale 奪取 / timeout）は `lock-core.ts` 側に集約し、結合テスト（concurrent / state-mutate）は各 mutate 側に残す。
