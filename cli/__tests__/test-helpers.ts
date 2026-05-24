/** body 全体を返す mockFetch（http レイヤーテスト用） */
export function mockFetchRaw(body: unknown, status = 200): typeof globalThis.fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

/** data を { success: 1, data } でラップして返す mockFetch（コマンドテスト用） */
export function mockFetchData(data: unknown): typeof globalThis.fetch {
  return async () => new Response(JSON.stringify({ success: 1, data }));
}

/** テスト用 API 認証情報 */
export const TEST_CREDS = { apiKey: "testkey", apiSecret: "testsecret" } as const;

/** stdout をキャプチャして後で読み取る */
export function captureStdout() {
  let buf = "";
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    buf += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  return {
    read: () => buf,
    restore: () => {
      process.stdout.write = orig;
    },
  };
}
