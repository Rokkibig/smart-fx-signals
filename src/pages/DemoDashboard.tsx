import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";
import { RefreshCw, RotateCcw } from "lucide-react";

interface Trade {
  id: string;
  pair: string;
  side: "LONG" | "SHORT";
  entry: number;
  sl: number;
  tp: number;
  lot: number;
  risk_usd: number;
  status: "OPEN" | "TP" | "SL" | "EXPIRED" | "MANUAL";
  opened_at: string;
  expires_at: string;
  closed_at: string | null;
  exit_price: number | null;
  realized_pnl: number | null;
}

interface Account {
  balance: number;
  starting_balance: number;
  currency: string;
}

const pipSize = (pair: string) => (pair.includes("JPY") ? 0.01 : 0.0001);
const PIP_VALUE_PER_LOT = 10;

const DemoDashboard = () => {
  const { user, signInWithGoogle } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const [{ data: acc }, { data: tr }] = await Promise.all([
      supabase.from("demo_accounts").select("balance, starting_balance, currency").eq("user_id", user.id).maybeSingle(),
      supabase.from("demo_trades").select("*").eq("user_id", user.id).order("opened_at", { ascending: false }).limit(200),
    ]);
    setAccount((acc as any) ?? { balance: 1000, starting_balance: 1000, currency: "USD" });
    setTrades((tr as any) ?? []);
    const pairs = [...new Set(((tr as any) ?? []).filter((t: Trade) => t.status === "OPEN").map((t: Trade) => t.pair))];
    const priceMap: Record<string, number> = {};
    for (const p of pairs) {
      const { data } = await supabase.rpc("get_latest_forex_price", { p_symbol: p as string });
      if (data && (data as any)[0]) priceMap[p as string] = Number((data as any)[0].price);
    }
    setPrices(priceMap);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
     
  }, [user?.id]);

  const openTrades = trades.filter((t) => t.status === "OPEN");
  const closedTrades = trades.filter((t) => t.status !== "OPEN");

  const floatingPnl = openTrades.reduce((sum, t) => {
    const live = prices[t.pair];
    if (!isFinite(live)) return sum;
    const move = ((t.side === "LONG" ? live - t.entry : t.entry - live) / pipSize(t.pair)) * PIP_VALUE_PER_LOT * t.lot;
    return sum + move;
  }, 0);

  const realizedPnl = closedTrades.reduce((s, t) => s + (Number(t.realized_pnl) || 0), 0);
  const wins = closedTrades.filter((t) => (Number(t.realized_pnl) || 0) > 0).length;
  const winRate = closedTrades.length ? Math.round((wins / closedTrades.length) * 100) : 0;
  const equity = (account?.balance ?? 0) + floatingPnl;

  const reset = async () => {
    if (!confirm("Скинути демо-акаунт? Всі відкриті угоди буде закрито.")) return;
    const { error } = await supabase.functions.invoke("reset-demo-account");
    if (error) { toast.error("Не вдалося скинути"); return; }
    toast.success("Демо-акаунт скинуто");
    load();
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <Header mode="rule" onModeChange={() => {}} lastUpdate="" autoRefresh={false} nextRefreshIn={0} />
          <div className="text-center py-16 space-y-4">
            <h1 className="text-2xl">Демо-торгівля</h1>
            <p className="text-muted-foreground">Увійдіть, щоб отримати віртуальний баланс $1000 і торгувати сигналами в один клік.</p>
            <Button onClick={signInWithGoogle}>Увійти з Google</Button>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <Header mode="rule" onModeChange={() => {}} lastUpdate="" autoRefresh={false} nextRefreshIn={0} />

        <main className="space-y-6">
          <div className="dotted-border p-6 grid grid-cols-2 md:grid-cols-5 gap-4">
            <Stat label="Баланс" value={`$${(account?.balance ?? 0).toFixed(2)}`} />
            <Stat label="Equity" value={`$${equity.toFixed(2)}`} accent={floatingPnl >= 0 ? "success" : "destructive"} />
            <Stat label="Плаваючий P/L" value={`${floatingPnl >= 0 ? "+" : ""}$${floatingPnl.toFixed(2)}`} accent={floatingPnl >= 0 ? "success" : "destructive"} />
            <Stat label="Realized P/L" value={`${realizedPnl >= 0 ? "+" : ""}$${realizedPnl.toFixed(2)}`} accent={realizedPnl >= 0 ? "success" : "destructive"} />
            <Stat label="Win-rate" value={`${winRate}% (${wins}/${closedTrades.length})`} />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />Оновити</Button>
            <Button variant="outline" size="sm" onClick={reset}><RotateCcw className="w-4 h-4 mr-2" />Скинути</Button>
          </div>

          <Tabs defaultValue="open">
            <TabsList>
              <TabsTrigger value="open">Відкриті ({openTrades.length})</TabsTrigger>
              <TabsTrigger value="history">Історія ({closedTrades.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="open" className="space-y-3 pt-4">
              {openTrades.length === 0 && <div className="text-muted-foreground text-center py-8">Немає відкритих угод. Натисніть «Торгувати демо» на будь-якому сигналі.</div>}
              {openTrades.map((t) => {
                const live = prices[t.pair];
                const pnl = isFinite(live) ? ((t.side === "LONG" ? live - t.entry : t.entry - live) / pipSize(t.pair)) * PIP_VALUE_PER_LOT * t.lot : 0;
                return (
                  <div key={t.id} className="dotted-border p-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                    <div><div className="text-xs text-muted-foreground">Пара</div><div className="font-mono">{t.pair} {t.side}</div></div>
                    <div><div className="text-xs text-muted-foreground">Entry</div><div className="font-mono">{Number(t.entry).toFixed(5)}</div></div>
                    <div><div className="text-xs text-muted-foreground">SL / TP</div><div className="font-mono text-xs">{Number(t.sl).toFixed(5)} / {Number(t.tp).toFixed(5)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Живий</div><div className="font-mono">{isFinite(live) ? live.toFixed(5) : "—"}</div></div>
                    <div><div className="text-xs text-muted-foreground">Лот</div><div className="font-mono">{Number(t.lot).toFixed(2)}</div></div>
                    <div><div className="text-xs text-muted-foreground">P/L</div><div className={`font-mono ${pnl >= 0 ? "text-success" : "text-destructive"}`}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</div></div>
                  </div>
                );
              })}
            </TabsContent>

            <TabsContent value="history" className="space-y-3 pt-4">
              {closedTrades.length === 0 && <div className="text-muted-foreground text-center py-8">Ще немає закритих угод.</div>}
              {closedTrades.map((t) => {
                const pnl = Number(t.realized_pnl) || 0;
                return (
                  <div key={t.id} className="dotted-border p-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                    <div><div className="text-xs text-muted-foreground">Пара</div><div className="font-mono">{t.pair} {t.side}</div></div>
                    <div><div className="text-xs text-muted-foreground">Entry → Exit</div><div className="font-mono text-xs">{Number(t.entry).toFixed(5)} → {t.exit_price ? Number(t.exit_price).toFixed(5) : "—"}</div></div>
                    <div><div className="text-xs text-muted-foreground">Лот</div><div className="font-mono">{Number(t.lot).toFixed(2)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Статус</div><div className={`font-mono ${t.status === "TP" ? "text-success" : t.status === "SL" ? "text-destructive" : ""}`}>{t.status}</div></div>
                    <div><div className="text-xs text-muted-foreground">Закрито</div><div className="text-xs">{t.closed_at ? new Date(t.closed_at).toLocaleString("uk-UA") : "—"}</div></div>
                    <div><div className="text-xs text-muted-foreground">P/L</div><div className={`font-mono ${pnl >= 0 ? "text-success" : "text-destructive"}`}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</div></div>
                  </div>
                );
              })}
            </TabsContent>
          </Tabs>
        </main>

        <Footer />
      </div>
    </div>
  );
};

const Stat = ({ label, value, accent }: { label: string; value: string; accent?: "success" | "destructive" }) => (
  <div>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`text-lg font-mono ${accent === "success" ? "text-success" : accent === "destructive" ? "text-destructive" : ""}`}>{value}</div>
  </div>
);

export default DemoDashboard;
