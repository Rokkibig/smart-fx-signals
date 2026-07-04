import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, RefreshCw, AlertCircle, ArrowRight } from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface EconEvent {
  id: string;
  event_time: string;
  currency: string;
  title: string;
  importance: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  processed_at: string | null;
  affected_symbols: string[] | null;
}

interface Revision {
  id: string;
  symbol: string;
  prev_direction: string | null;
  prev_probability: number | null;
  new_direction: string;
  new_probability: number;
  reasoning: string | null;
  created_at: string;
  event_id: string | null;
}

const impColor = (i: string) =>
  i === "high" ? "destructive" : i === "medium" ? "default" : "secondary";

export default function NewsCalendar() {
  const [events, setEvents] = useState<EconEvent[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const now = new Date();
    const from = new Date(now.getTime() - 12 * 3600 * 1000).toISOString();
    const to = new Date(now.getTime() + 72 * 3600 * 1000).toISOString();
    const [e, r] = await Promise.all([
      supabase
        .from("economic_events")
        .select("*")
        .gte("event_time", from)
        .lte("event_time", to)
        .order("event_time", { ascending: true })
        .limit(60),
      supabase
        .from("forecast_revisions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);
    setEvents((e.data ?? []) as EconEvent[]);
    setRevisions((r.data ?? []) as Revision[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const run = async (fn: "fetch-economic-calendar" | "revise-forecasts-on-news", label: string) => {
    setBusy(fn);
    try {
      const { data, error } = await supabase.functions.invoke(fn);
      if (error) throw error;
      toast.success(`${label}: OK`, { description: JSON.stringify(data) });
      await load();
    } catch (e: any) {
      toast.error(label, { description: e.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Календар новин та ревізії</h2>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!!busy}
            onClick={() => run("fetch-economic-calendar", "Оновлення календаря")}>
            <RefreshCw className={`w-3 h-3 mr-1 ${busy === "fetch-economic-calendar" ? "animate-spin" : ""}`} />
            Оновити календар
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy}
            onClick={() => run("revise-forecasts-on-news", "Перепровірка")}>
            <RefreshCw className={`w-3 h-3 mr-1 ${busy === "revise-forecasts-on-news" ? "animate-spin" : ""}`} />
            Перепровірити
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Завантаження…</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Найближчі події (±12/72 год)</div>
            {events.length === 0 ? (
              <div className="text-sm text-muted-foreground">Немає запланованих новин. Натисніть «Оновити календар».</div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                {events.map((e) => {
                  const d = new Date(e.event_time);
                  const isPast = d.getTime() < Date.now();
                  return (
                    <div key={e.id} className={`border rounded-md p-2 text-xs ${isPast ? "opacity-70" : ""}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={impColor(e.importance) as any}>{e.currency}</Badge>
                          <span className="font-medium">{e.title}</span>
                        </div>
                        <span className="text-muted-foreground">{d.toLocaleString("uk-UA", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
                      </div>
                      <div className="flex gap-3 text-muted-foreground">
                        <span>факт: <b className="text-foreground">{e.actual ?? "—"}</b></span>
                        <span>прог: {e.forecast ?? "—"}</span>
                        <span>попер: {e.previous ?? "—"}</span>
                        {e.processed_at && <span className="text-success">✓ оброблено</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Останні ревізії прогнозу</div>
            {revisions.length === 0 ? (
              <div className="text-sm text-muted-foreground">Поки що ревізій немає.</div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                {revisions.map((r) => (
                  <div key={r.id} className="border rounded-md p-2 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertCircle className="w-3 h-3" />
                        {r.symbol}
                      </div>
                      <span className="text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("uk-UA", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{r.prev_direction ?? "—"} {r.prev_probability ?? ""}%</Badge>
                      <ArrowRight className="w-3 h-3" />
                      <Badge>{r.new_direction} {r.new_probability}%</Badge>
                    </div>
                    {r.reasoning && <div className="text-muted-foreground">{r.reasoning}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
