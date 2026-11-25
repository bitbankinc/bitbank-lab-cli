// 100行超: Zod 3 の既定エラーメッセージ表を issue code ごとに 1 か所へ集約している。
// 分割すると v3 の既定 error map との対応表として突き合わせられなくなる。
//
// Zod 3 の既定エラーメッセージを Zod 4 上で再現する global error map。
//
// CLI の引数エラーは issue の message をそのまま返す（cli/validators.ts の formatZodError）。
// Zod 4 で既定の文言が変わった（例: `Invalid enum value. Expected 'day' | 'month', received
// 'week'` → `Invalid option: expected one of "day"|"month"`）ため、ユーザーに見える文言を
// v3 のまま保つ。Zod 4 は確定した issue から input を落とすので、formatZodError 側で
// 後から組み立て直すことはできず（"received 'week'" が作れない）、ここで生成時に差し込む。
//
// schema 側で文言を指定した issue には効かない（Zod 4 では schema の error が global の
// customError より先に勝つ）。文言は zod@3.25 の既定 error map に合わせ、v3 と同じ文言に
// なるもの・v3 に対応する issue が無いもの（custom / invalid_key 等）は undefined を返して
// Zod 4 の既定に任せる。
import { z } from "zod";

type Issue = z.core.$ZodRawIssue;

/** v3 の util.joinValues: 文字列だけ '...' で囲んで連結する。 */
function joinValues(values: readonly unknown[], sep = " | "): string {
  return values.map((v) => (typeof v === "string" ? `'${v}'` : String(v))).join(sep);
}

/** v3 の getParsedType（"received" に出る型名）。 */
function parsedType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isNaN(v) ? "nan" : "number";
  if (v instanceof Date) return "date";
  if (v instanceof Map) return "map";
  if (v instanceof Set) return "set";
  return typeof v;
}

function invalidType(expected: string, input: unknown): string {
  if (input === undefined) return "Required";
  if (expected === "int" && typeof input === "number") return "Expected integer, received float";
  // Zod 4 の z.number() は ±Infinity を型エラーにする（v3 では `.finite()` の責務だった）
  if (expected === "number" && typeof input === "number" && !Number.isNaN(input)) {
    return "Number must be finite";
  }
  return `Expected ${expected}, received ${parsedType(input)}`;
}

/** enum / literal の不一致。v3 では未指定・型違いの enum は invalid_type 扱いだった。 */
function invalidValue(iss: Issue, values: readonly unknown[]): string {
  const def = iss.inst?._zod.def;
  if (def && "type" in def && def.type === "literal") {
    return `Invalid literal value, expected ${JSON.stringify(values[0])}`;
  }
  if (iss.input === undefined) return "Required";
  if (typeof iss.input !== "string") {
    return `Expected ${joinValues(values)}, received ${parsedType(iss.input)}`;
  }
  return `Invalid enum value. Expected ${joinValues(values)}, received '${iss.input}'`;
}

type Bound = { origin: string; exact?: boolean; inclusive?: boolean };

function tooSmall({ origin, exact, inclusive }: Bound, n: number | bigint): string | undefined {
  if (origin === "string") {
    return `String must contain ${exact ? "exactly" : inclusive ? "at least" : "over"} ${n} character(s)`;
  }
  if (origin === "array") {
    return `Array must contain ${exact ? "exactly" : inclusive ? "at least" : "more than"} ${n} element(s)`;
  }
  if (origin === "number" || origin === "int") {
    if (exact) return `Number must be exactly equal to ${n}`;
    return `Number must be greater than ${inclusive ? "or equal to " : ""}${n}`;
  }
  return undefined;
}

function tooBig({ origin, exact, inclusive }: Bound, n: number | bigint): string | undefined {
  if (origin === "string") {
    return `String must contain ${exact ? "exactly" : inclusive ? "at most" : "under"} ${n} character(s)`;
  }
  if (origin === "array") {
    return `Array must contain ${exact ? "exactly" : inclusive ? "at most" : "less than"} ${n} element(s)`;
  }
  if (origin === "number" || origin === "int") {
    if (exact) return `Number must be exactly ${n}`;
    return `Number must be less than ${inclusive ? "or equal to " : ""}${n}`;
  }
  return undefined;
}

/** v3 は regex を "Invalid"、startsWith 等を "Invalid input: must ..." と出していた。 */
function invalidFormat(format: string, iss: Issue): string {
  if (format === "regex") return "Invalid";
  if (format === "starts_with") return `Invalid input: must start with "${String(iss.prefix)}"`;
  if (format === "ends_with") return `Invalid input: must end with "${String(iss.suffix)}"`;
  if (format === "includes") return `Invalid input: must include "${String(iss.includes)}"`;
  return `Invalid ${format}`;
}

export function zodV3Message(iss: Issue): string | undefined {
  switch (iss.code) {
    case "invalid_type":
      return invalidType(iss.expected, iss.input);
    case "invalid_value":
      return invalidValue(iss, iss.values);
    case "too_small":
      return tooSmall(iss, iss.minimum);
    case "too_big":
      return tooBig(iss, iss.maximum);
    case "invalid_format":
      return invalidFormat(iss.format, iss);
    case "not_multiple_of":
      return `Number must be a multiple of ${iss.divisor}`;
    case "unrecognized_keys":
      return `Unrecognized key(s) in object: ${joinValues(iss.keys, ", ")}`;
    case "invalid_union":
      return Array.isArray(iss.options) && iss.options.length > 0
        ? `Invalid discriminator value. Expected ${joinValues(iss.options)}`
        : undefined;
  }
  return undefined;
}

z.config({ customError: zodV3Message });
