// periodical-brief の同時実行ガード。並列数を無制限にすると 30 銘柄超で 15〜26 秒の
// 失速が頻発する（issue #21 の実測。エラーは返らず遅延するだけなのでトークンバケット型の
// レート制限と推定）。既定 16 は参考実装の実測値で、サーバ側の制限に依存する経験値。
export const DEFAULT_CONCURRENCY = 16;
export const MAX_CONCURRENCY = 64;

/** items を最大 limit 並列で fn に通し、入力順で結果を返す。fn は Result を返し
 *  例外を投げない前提（CLAUDE.md: 全コマンドは Result パターン）。 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
