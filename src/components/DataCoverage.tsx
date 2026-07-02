import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { Database, RefreshCw, Download } from 'lucide-react';

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD'];
const TFS = ['D1', 'H4', 'H1', 'M15'] as const;

type Row = {
  symbol: string;
  timeframe: string;
  count: number;
  min_ts: string | null;
  max_ts: string | null;
};

type Job = {
  id: string;
  symbol: string;
  timeframe: string;
  status: string;
  done_bars: number;
  est_total_bars: number | null;
  last_ts: string | null;
  error: string | null;
  updated_at: string;
};

export default function DataCoverage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: ohlcv }, { data: jobData }] = await Promise.all([
      supabase.from('forex_ohlcv').select('symbol, timeframe, bar_timestamp'),
      supabase.from('backfill_jobs').select('*').order('updated_at', { ascending: false }).limit(30),
    ]);

    const map = new Map<string, Row>();
    (ohlcv ?? []).forEach((r: any) => {
      const key = `${r.symbol}_${r.timeframe}`;
      const cur = map.get(key) ?? { symbol: r.symbol, timeframe: r.timeframe, count: 0, min_ts: null, max_ts: null };
      cur.count += 1;
      if (!cur.min_ts || r.bar_timestamp < cur.min_ts) cur.min_ts = r.bar_timestamp;
      if (!cur.max_ts || r.bar_timestamp > cur.max_ts) cur.max_ts = r.bar_timestamp;
      map.set(key, cur);
    });
    setRows(Array.from(map.values()));
    setJobs((jobData ?? []) as Job[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const runBackfill = async (opts?: { pairs?: string[]; timeframes?: string[] }) => {
    setStarting(true);
    const { error } = await supabase.functions.invoke('backfill-ohlcv', {
      body: opts ?? {},
    });
    setStarting(false);
    if (error) toast.error('Помилка запуску', { description: error.message });
    else {
      toast.success('Бекфіл запущено', { description: 'Прогрес зʼявиться нижче за 15 сек' });
      setTimeout(load, 3000);
    }
  };

  const cell = (symbol: string, tf: string) => rows.find((r) => r.symbol === symbol && r.timeframe === tf);
  const fmtDate = (s: string | null) => (s ? new Date(s).toISOString().slice(0, 10) : '—');
  const runningJobs = jobs.filter((j) => j.status === 'running' || j.status === 'pending');

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Покриття історією цін</h3>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Оновити
          </Button>
          <Button size="sm" onClick={() => runBackfill()} disabled={starting || runningJobs.length > 0}>
            <Download className="w-4 h-4 mr-1" />
            {runningJobs.length > 0 ? `У процесі: ${runningJobs.length}` : 'Бекфіл всієї історії'}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Стандартна глибина: <b>D1</b> — 15 років, <b>H4</b> — 5 років, <b>H1</b> — 2 роки, <b>M15</b> — 6 міс.
        Оновлення нових барів відбувається автоматично за розкладом (M15 кожні 15 хв, H1 щогодини, H4 кожні 4 год, D1 після закриття NY).
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4">Пара</th>
              {TFS.map((tf) => (
                <th key={tf} className="py-2 pr-4">{tf}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PAIRS.map((p) => (
              <tr key={p} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{p}</td>
                {TFS.map((tf) => {
                  const c = cell(p, tf);
                  return (
                    <td key={tf} className="py-2 pr-4">
                      {c ? (
                        <div className="flex flex-col leading-tight">
                          <span className="font-mono">{c.count.toLocaleString()}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {fmtDate(c.min_ts)} → {fmtDate(c.max_ts)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {jobs.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold mb-2">Останні задачі бекфілу</h4>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {jobs.map((j) => {
              const pct = j.est_total_bars ? Math.min(100, Math.round((j.done_bars / j.est_total_bars) * 100)) : null;
              const color =
                j.status === 'done' ? 'default'
                : j.status === 'error' ? 'destructive'
                : j.status === 'running' ? 'secondary'
                : 'outline';
              return (
                <div key={j.id} className="flex items-center justify-between text-xs border-b py-1 last:border-0 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={color as any} className="shrink-0">{j.status}</Badge>
                    <span className="font-mono">{j.symbol} {j.timeframe}</span>
                    {j.error && <span className="text-destructive truncate" title={j.error}>{j.error}</span>}
                  </div>
                  <div className="text-muted-foreground shrink-0">
                    {j.done_bars.toLocaleString()} бар{pct !== null && ` (${pct}%)`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
