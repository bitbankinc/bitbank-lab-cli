import { privateAccountSchemas } from "./defs-private-account.js";
import { privateMarginSchemas } from "./defs-private-margin.js";
import { privateTransferSchemas } from "./defs-private-transfer.js";
import { publicDataSchemas } from "./defs-public-data.js";
import { publicMarketSchemas } from "./defs-public-market.js";
import { streamSchemas, tradeSchemas } from "./defs-trade.js";
import type { SchemaDef } from "./types.js";

export const ALL_SCHEMAS: Record<string, SchemaDef> = {
  ...publicMarketSchemas,
  ...publicDataSchemas,
  ...privateAccountSchemas,
  ...privateTransferSchemas,
  ...privateMarginSchemas,
  ...tradeSchemas,
  ...streamSchemas,
};
