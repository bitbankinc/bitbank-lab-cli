import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach } from "vitest";
import { PAIRS_CACHE_VERSION } from "../pairs-cache.js";
import { resetThrottle } from "../throttle.js";
import { MOCK_PAIRS } from "./test-helpers.js";

// テスト間で profiles.json が ~/.bitbank に共有されると干渉するため、
// tmp の存在しないパスに固定して隔離する。各テスト前にファイルを削除する
// ことで CRUD 系テストが書き残した state も次テストに漏らさない。
const tmp = mkdtempSync(join(tmpdir(), "bitbank-tests-"));
const profilesPath = join(tmp, "profiles.json");
process.env.BITBANK_PROFILES_PATH = profilesPath;

// 実 trade dry-run の手数料見積りが public /spot/pairs を引くようになったため、
// 既知ペアを tmp キャッシュに seed して実 API を叩かせない。env はサブプロセス
// （e2e の execFile / spawn）にも継承され、CLI 全体の dry-run がオフラインで完結する。
// profiles.json と違いここで一度だけ seed し beforeEach では再生成しない。これは
// 意図的に永続な read-only フィクスチャで、どのテストもこの default パスへは書かない
// （fetchedAt が新しく TTL 内なので getPairsWithCache は常にヒット＝書き込み無し。
//  キャッシュ更新を検証するテストは pairs-cache.test.ts 等が独自パスを渡す）。
// そのため CRUD で中身が変わる profiles.json のような毎テストのリセットは不要。
const pairsCachePath = join(tmp, "pairs-cache.json");
process.env.BITBANK_PAIRS_CACHE_PATH = pairsCachePath;
writeFileSync(
  pairsCachePath,
  JSON.stringify({
    version: PAIRS_CACHE_VERSION,
    fetchedAt: new Date(Date.now()).toISOString(),
    pairs: MOCK_PAIRS,
  }),
  { mode: 0o600 },
);

beforeEach(() => {
  resetThrottle();
  rmSync(profilesPath, { force: true });
});
