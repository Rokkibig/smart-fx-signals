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
  name: "list_my_demo_trades",
  title: "List my demo trades",
  description: "Returns the signed-in user's demo trades (open and closed), most recent first.",
  inputSchema: {
    status: z.enum(["OPEN", "CLOSED", "ALL"]).describe("Filter by status").default("ALL"),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ status }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = sb(ctx)
      .from("demo_trades")
      .select("*")
      .eq("user_id", ctx.getUserId())
      .order("opened_at", { ascending: false })
      .limit(50);
    if (status && status !== "ALL") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { trades: data ?? [] },
    };
  },
});
