// 信用注文の実機確認 #M-6（docs/dev/margin-order-plan.md §4 Step 6）。開発用スクリプト。
//   npx tsx scripts/dev/margin-probe-m6.ts [sell-long|buy-short] [--execute --ack=<phrase>]
// 建玉が無い状態で「返済方向」（sell×long / buy×short）の信用注文を出すと API が
// どう応答するかを観測する。価格は現在値の 2 倍（sell）/ 半分（buy）なので約定しない。
// 注文が通った場合は active_orders を表示してから即キャンセルする（#M-4 の確認を兼ねる）。
// 認証は通常の CLI と同じ（default profile → BITBANK_API_KEY / BITBANK_API_SECRET env）。
//
// --execute なしでは注文 POST は実行しない。建玉確認の private GET と ticker の public GET
// は実行して body を表示する。
//
// 前提: 検証専用アカウント（他の bot・手動発注がすべて止まっている口座）で使う。
// 建玉確認と POST の間に同じペア・同方向の建玉が開くと、テスト注文が本物の返済注文になり
// locked_amount を予約する。直前の再確認では防げないので、--execute には
// --ack=I-HAVE-NO-OTHER-ORDERS を必須にして運用側の保証を明示させる。
//
// 終了コード: 0 = 観測完了（拒否された / 通って取消確認済み）、1 = 前提・GET 失敗、
// 2 = 注文状態が不確定（POST 応答なし・取消未確認）。2 のときは active-orders で手動確認。
import { publicGet } from "../../cli/http.js";
import { privateGet } from "../../cli/http-private.js";
import { privatePost } from "../../cli/http-private-post.js";

const PAIR = "btc_jpy";
const AMOUNT = "0.0001"; // /spot/pairs の unit_amount
const ACK_PHRASE = "I-HAVE-NO-OTHER-ORDERS";
const CASE = process.argv[2] === "buy-short" ? "buy-short" : "sell-long";
const EXECUTE = process.argv.includes("--execute");
const ACK = process.argv.find((a) => a.startsWith("--ack="))?.slice("--ack=".length);

const [side, position_side] = CASE === "buy-short" ? ["buy", "short"] : ["sell", "long"];

if (EXECUTE && ACK !== ACK_PHRASE) {
  console.error(
    `--execute には --ack=${ACK_PHRASE} が必要です（専用アカウントで他の発注が無いことの確認）`,
  );
  process.exit(1);
}

// GET /user/margin/positions はパラメータを受けない（全ペア返却）。pair はローカルで絞る。
type Positions = { positions: { pair: string; position_side: string; open_amount: string }[] };
const pos = await privateGet<Positions>("/user/margin/positions");
if (!pos.success) {
  console.error("margin/positions 失敗:", pos.error);
  process.exit(1);
}
const open = pos.data.positions.find(
  (p) => p.pair === PAIR && p.position_side === position_side,
)?.open_amount;
if (Number(open) !== 0) {
  console.error(`建玉あり (${PAIR} ${position_side} open_amount=${open})。実験を中止します`);
  process.exit(1);
}

const t = await publicGet<{ last: string }>(`/${PAIR}/ticker`);
if (!t.success) {
  console.error("ticker 失敗:", t.error);
  process.exit(1);
}
const last = Number(t.data.last);
const price = String(side === "sell" ? Math.round(last * 2) : Math.round(last / 2));

const body = { pair: PAIR, side, position_side, type: "limit", price, amount: AMOUNT };
console.log("body:", JSON.stringify(body));
if (!EXECUTE) {
  console.log(`(dry) --execute --ack=${ACK_PHRASE} を付けると送信します`);
  process.exit(0);
}

type ActiveOrder = {
  order_id: number;
  pair: string;
  side: string;
  position_side?: string;
  price?: string;
};
type ActiveOrders = { orders: ActiveOrder[] };

/** この body と同じ形の未約定注文を探す（POST 応答が失われたときの候補特定用）。 */
async function findMatchingActive(): Promise<ActiveOrder[] | undefined> {
  const active = await privateGet<ActiveOrders>("/user/spot/active_orders", { pair: PAIR });
  console.log("active_orders:", JSON.stringify(active, null, 2));
  if (!active.success) return undefined;
  return active.data.orders.filter(
    (o) =>
      o.pair === PAIR && o.side === side && o.position_side === position_side && o.price === price,
  );
}

const r = await privatePost<{ order_id: number }>("/user/spot/order", body);
console.log("order response:", JSON.stringify(r, null, 2));

let orderId: number | undefined;
if (r.success) {
  orderId = r.data.order_id;
} else if (/^API error: \d+/.test(r.error)) {
  // API が明示的に拒否した（#M-6 の主要な観測結果）。注文は残っていない。
  process.exit(0);
} else {
  // ネットワーク例外・タイムアウト: 受理されたか不明。active_orders で候補を探す。
  console.error("POST の応答が得られませんでした。注文が残っている可能性があります");
  const matches = await findMatchingActive();
  if (matches === undefined || matches.length !== 1) {
    console.error("注文を特定できません。bitbank active-orders で手動確認してください");
    process.exit(2);
  }
  orderId = matches[0].order_id;
}

await findMatchingActive();
const c = await privatePost<unknown>("/user/spot/cancel_order", { pair: PAIR, order_id: orderId });
console.log("cancel response:", JSON.stringify(c, null, 2));
if (!c.success) {
  console.error(`取消未確認（order_id=${orderId}）。bitbank active-orders で手動確認してください`);
  process.exit(2);
}
