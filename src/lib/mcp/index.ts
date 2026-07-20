import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getLatestPrice from "./tools/get-latest-price";
import listDailyForecasts from "./tools/list-daily-forecasts";
import getMarketReview from "./tools/get-market-review";
import getMyCredits from "./tools/get-my-credits";
import listMyDemoTrades from "./tools/list-my-demo-trades";

// Issuer MUST be the direct supabase.co host, derived from the project ref at
// build time. See app-mcp-server-authoring knowledge for the rationale.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "fx-signal-suite-mcp",
  title: "FX Signal Suite",
  version: "0.1.0",
  instructions:
    "Tools for FX Signal Suite: read latest forex prices, statistical daily forecasts, the current AI market review, your credit balance, and your demo trading account. All calls run as the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getLatestPrice,
    listDailyForecasts,
    getMarketReview,
    getMyCredits,
    listMyDemoTrades,
  ],
});
