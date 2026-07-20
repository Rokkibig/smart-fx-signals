declare const process: { env: Record<string, string | undefined> };
import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

const SYMBOLS = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "NZD/USD", "USD/CAD"] as const;

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_latest_price",
  title: "Get latest forex price",
  description: "Returns the most recent price, bid, ask and spread for a supported forex pair.",
  inputSchema: {
    symbol: z.enum(SYMBOLS).describe("Forex pair symbol, e.g. EUR/USD"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ symbol }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { data, error } = await sb(ctx).rpc("get_latest_forex_price", { p_symbol: symbol });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const row = data?.[0];
    if (!row) return { content: [{ type: "text", text: `No price for ${symbol}` }] };
    return {
      content: [{ type: "text", text: JSON.stringify(row) }],
      structuredContent: { price: row },
    };
  },
});
