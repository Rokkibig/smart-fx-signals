import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, Target, Brain, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface Forecast {
  id: string;
  symbol: string;
  forecast_date: string;
  direction: "up" | "down" | "neutral";
  probability: number;
  price_at_forecast: number;
  target_price: number | null;
  stop_price: number | null;
  current_entry: number | null;
  current_target: number | null;
  current_stop: number | null;
  status: string;
  adjustments_count: number;
  invalidation_reason: string | null;
  expected_move_pips: number | null;
  reasoning: string | null;
  news_context: string | null;
  actual_direction: string | null;
  actual_move_pips: number | null;
  accuracy_score: number | null;
  evaluated_at: string | null;
  created_at: string;
}

interface Stat {
  symbol: string;
  total_forecasts: number;
  correct_direction: number;
  avg_accuracy: number;
  avg_probability: number;
}

const dirIcon = (d: string) =>
  d === "up" ? <TrendingUp className="w-4 h-4 text-success" /> :
  d === "down" ? <TrendingDown className="w-4 h-4 text-destructive" /> :
  <Minus className="w-4 h-4 text-muted-foreground" />;

export default function DailyForecasts() {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    const [f, s] = await Promise.all([
      supabase
        .from("daily_forecasts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("forecast_stats").select("*").order("symbol"),
    ]);
    setForecasts((f.data ?? []) as Forecast[]);
    setStats((s.data ?? []) as Stat[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const overall = stats.reduce(
    (acc, s) => {
      acc.total += s.total_forecasts;
      acc.correct += s.correct_direction;
      acc.accSum += s.avg_accuracy * s.total_forecasts;
      return acc;
    },
    { total: 0, correct: 0, accSum: 0 }
  );
  const overallHit = overall.total > 0 ? ((overall.correct / overall.total) * 100).toFixed(1) : "—";
  const overallAcc = overall.total > 0 ? (overall.accSum / overall.total).toFixed(1) : "—";

  const runGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-daily-forecasts");
      if (error) throw error;
      toast.success(`Прогнози згенеровано: ${data?.count ?? 0}`);
      await load();
    } catch (e: any) {
      toast.error("Помилка генерації", { description: e.message });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Добовий аналізатор</h2>
        </div>
        <Button size="sm" variant="outline" onClick={runGenerate} disabled={generating} className="gap-2">
          <RefreshCw className={`w-3 h-3 ${generating ? "animate-spin" : ""}`} />
          {generating ? "Генерація…" : "Згенерувати зараз"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 text-sm">
        <div className="border rounded-md p-3">
          <div className="text-muted-foreground text-xs">Всього прогнозів</div>
          <div className="text-xl font-semibold">{overall.total}</div>
        </div>
        <div className="border rounded-md p-3">
          <div className="text-muted-foreground text-xs">Точність напрямку</div>
          <div className="text-xl font-semibold">{overallHit}%</div>
        </div>
        <div className="border rounded-md p-3">
          <div className="text-muted-foreground text-xs">Середній score</div>
          <div className="text-xl font-semibold">{overallAcc}</div>
        </div>
        <div className="border rounded-md p-3">
          <div className="text-muted-foreground text-xs">Пар відстежується</div>
          <div className="text-xl font-semibold">{stats.length}</div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Завантаження…</div>
      ) : forecasts.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          Ще немає прогнозів. Натисніть «Згенерувати зараз», щоб створити перший набір, або дочекайтесь автозапуску о 22:15 UTC.
        </div>
      ) : (
        <div className="space-y-2">
          {forecasts.map((f) => (
            <div key={f.id} className="border rounded-md p-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 font-medium">
                  {dirIcon(f.direction)}
                  <span>{f.symbol}</span>
                  <Badge variant="outline">{f.probability}%</Badge>
                  {f.expected_move_pips != null && (
                    <span className="text-xs text-muted-foreground">
                      ~{f.expected_move_pips} п.
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{f.forecast_date}</div>
              </div>

              {f.reasoning && (
                <div className="text-muted-foreground text-xs mb-2">{f.reasoning}</div>
              )}

              <div className="flex flex-wrap gap-3 text-xs">
                <span>Ціна: <b>{f.price_at_forecast}</b></span>
                {f.target_price && (
                  <span className="flex items-center gap-1">
                    <Target className="w-3 h-3" /> {f.target_price}
                  </span>
                )}
                {f.stop_price && <span>Stop: {f.stop_price}</span>}
              </div>

              {f.evaluated_at ? (
                <div className="mt-2 pt-2 border-t flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {dirIcon(f.actual_direction ?? "neutral")}
                    <span>факт: {f.actual_move_pips} п.</span>
                  </div>
                  <Badge
                    variant={
                      (f.accuracy_score ?? 0) >= 70 ? "default" :
                      (f.accuracy_score ?? 0) >= 40 ? "secondary" : "destructive"
                    }
                  >
                    Score: {f.accuracy_score}
                  </Badge>
                </div>
              ) : (
                <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                  Оцінка через 24 год після створення
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
