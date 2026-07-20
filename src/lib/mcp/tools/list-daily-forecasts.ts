import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_daily_forecasts",
  title: "List daily forecasts",
  description: "Latest statistical daily forecasts across all tracked forex pairs (direction, entry, SL, TP, probability).",
  inputSchema: {
    limit: z.number().int().positive().describe("Max rows to return (1..50)").default(10),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const capped = Math.min(Math.max(limit ?? 10, 1), 50);
    const { data, error } = await sb(ctx)
      .from("daily_forecasts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(capped);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { forecasts: data ?? [] },
    };
  },
});
