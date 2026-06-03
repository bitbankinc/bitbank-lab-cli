import { z } from "zod";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { parseResponse } from "../../parse-response.js";
import type { Result } from "../../types.js";

// 実質的支配者（substantial controller）。JSON 例の uuid/name/country/prefecture を正とする
// （docs 表では本体 originator とキーが重複表記される箇所があるが JSON 例を採用）。prefecture は null あり。
const SubstantialControllerSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  country: z.string(),
  prefecture: z.string().nullable(),
});

// GET /user/deposit_originators の originators[] 要素。氏名・住所・会社情報は
// 未登録時に null で返るため nullable。架空の address / asset / network は持たない。
const OriginatorSchema = z.object({
  uuid: z.string(),
  label: z.string(),
  deposit_type: z.string(),
  deposit_purpose: z.string().nullable(),
  originator_status: z.string(),
  originator_type: z.string(),
  originator_last_name: z.string().nullable(),
  originator_first_name: z.string().nullable(),
  originator_country: z.string().nullable(),
  originator_prefecture: z.string().nullable(),
  originator_city: z.string().nullable(),
  originator_address: z.string().nullable(),
  originator_building: z.string().nullable(),
  originator_company_name: z.string().nullable(),
  originator_company_type: z.string().nullable(),
  originator_company_type_position: z.string().nullable(),
  originator_substantial_controllers: z.array(SubstantialControllerSchema),
});

const ResponseSchema = z.object({
  originators: z.array(OriginatorSchema),
});

export type DepositOriginator = z.infer<typeof OriginatorSchema>;

// docs の Parameters は None。実装も params を送らない（asset 等は受け取らない）。
export async function depositOriginators(
  opts?: PrivateHttpOptions,
): Promise<Result<DepositOriginator[]>> {
  const result = await privateGet<unknown>("/user/deposit_originators", undefined, opts);
  return parseResponse(result, ResponseSchema, "originators");
}
