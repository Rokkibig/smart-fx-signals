import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Clock } from "lucide-react";

interface Outcome {
  id: string;
  pair: string;
  side: string;
  entry: number;
  sl: number;
  tp: number;
  rr: number | null;
  confidence: number | null;
  status: string;
  expected_pnl: number | null;
  realized_pnl: number | null;
  surprise_ratio: number | null;
  exit_price: number | null;
  opened_at: string;
  closed_at: string | null;
}

const TrackRecord = () => {
  const [rows, setRows] = useState<Outcome[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("signal_outcomes")
        .select("*")
        .order("opened_at", { ascending: false })
        .limit(50);
      setRows((data ?? []) as Outcome[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-sm text-muted-foreground">Завантаження треку…</div>;
  if (rows.length === 0) return null;

  const closed = rows.filter(r => r.status !== "OPEN");
  const wins = closed.filter(r => r.status === "TP").length;
  const losses = closed.filter(r => r.status === "SL").length;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;
  const avgRR = rows.reduce((s, r) => s + (r.rr ?? 0), 0) / rows.length;
  const surprises = closed.filter(r => r.surprise_ratio !== null);
  const avgSurprise = surprises.length
    ? surprises.reduce((s, r) => s + (r.surprise_ratio ?? 0), 0) / surprises.length
    : 0;
  const openCount = rows.filter(r => r.status === "OPEN").length;

  const statusColor = (s: string) =>
    s === "TP" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
    : s === "SL" ? "bg-rose-500/15 text-rose-500 border-rose-500/30"
    : s === "EXPIRED" ? "bg-muted text-muted-foreground"
    : "bg-blue-500/15 text-blue-500 border-blue-500/30";

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">📈 Track Record (останні 50)</h2>
        <div className="text-xs text-muted-foreground">Оновлюється кожні 15 хв</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Stat label="Win rate" value={`${winRate.toFixed(1)}%`} sub={`${wins}W / ${losses}L`} />
        <Stat label="Закрито" value={String(closed.length)} sub={`з ${rows.length}`} />
        <Stat label="Відкриті" value={String(openCount)} sub="в роботі" />
        <Stat label="Ср. R:R" value={avgRR.toFixed(2)} sub="план" />
        <Stat label="Ср. surprise" value={avgSurprise.toFixed(2)} sub="менше = краще" />
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {rows.map(r => (
          <div key={r.id} className="flex items-center gap-2 text-xs border rounded-md px-3 py-2">
            <Badge variant="outline" className={statusColor(r.status)}>
              {r.status === "OPEN" ? <Clock className="w-3 h-3 mr-1" /> :
               r.side === "LONG" ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {r.status}
            </Badge>
            <span className="font-medium min-w-[70px]">{r.pair}</span>
            <span className="text-muted-foreground">{r.side}</span>
            <span className="text-muted-foreground">@ {Number(r.entry).toFixed(5)}</span>
            <span className="text-muted-foreground hidden md:inline">
              SL {Number(r.sl).toFixed(5)} · TP {Number(r.tp).toFixed(5)} · R:R {(r.rr ?? 0).toFixed(2)}
            </span>
            {r.realized_pnl !== null && (
              <span className={`ml-auto font-mono ${Number(r.realized_pnl) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {Number(r.realized_pnl) >= 0 ? "+" : ""}{Number(r.realized_pnl).toFixed(5)}
              </span>
            )}
            {r.surprise_ratio !== null && (
              <span className="text-muted-foreground hidden md:inline">σ {Number(r.surprise_ratio).toFixed(2)}</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="border rounded-md p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-lg font-semibold">{value}</div>
    {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
  </div>
);

export default TrackRecord;
