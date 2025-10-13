interface TrendMatrix {
  D1: "↗" | "↘" | "→";
  H4: "↗" | "↘" | "→";
  H1: "↗" | "↘" | "→";
  M15: "↗" | "↘" | "→";
}

interface Signal {
  type: string;
  entry: number;
  sl: number;
  tp1: number;
  tp2?: number;
  prob: number;
  source: string;
  notes?: string;
}

interface PairData {
  pair: string;
  price: number;
  trend_matrix: TrendMatrix;
  trend: "↗" | "↘" | "→";
  strength: number;
  signals: Signal[];
}

const getTrendColor = (trend: "↗" | "↘" | "→") => {
  if (trend === "↗") return "text-success";
  if (trend === "↘") return "text-destructive";
  return "text-trend-neutral";
};

const getTrendBg = (trend: "↗" | "↘" | "→") => {
  if (trend === "↗") return "bg-success/5";
  if (trend === "↘") return "bg-destructive/5";
  return "bg-muted/30";
};

export const PairCard = ({ data, mode }: { data: PairData; mode: "rule" | "hybrid" }) => {
  const { pair, price, trend_matrix, trend, strength, signals } = data;
  
  // Filter signals based on mode
  const displaySignals = mode === "rule" 
    ? signals.filter(s => s.source === "Rule-Only")
    : signals;

  return (
    <div className="dotted-border bg-card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl tracking-wider">{pair}</h2>
        <span className="text-sm text-muted-foreground">{price.toFixed(5)}</span>
      </div>

      {/* Trend Matrix */}
      <div className="dotted-border-t dotted-border-b py-3">
        <div className="grid grid-cols-4 gap-3 text-center text-xs">
          <div>
            <div className="text-muted-foreground mb-1">D1</div>
            <div className={`text-lg ${getTrendColor(trend_matrix.D1)}`}>
              {trend_matrix.D1}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground mb-1">H4</div>
            <div className={`text-lg ${getTrendColor(trend_matrix.H4)}`}>
              {trend_matrix.H4}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground mb-1">H1</div>
            <div className={`text-lg ${getTrendColor(trend_matrix.H1)}`}>
              {trend_matrix.H1}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground mb-1">M15</div>
            <div className={`text-lg ${getTrendColor(trend_matrix.M15)}`}>
              {trend_matrix.M15}
            </div>
          </div>
        </div>
      </div>

      {/* Overall Trend & Strength */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Тренд:</span>
          <span className={`text-2xl ${getTrendColor(trend)}`}>{trend}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Сила:</span>
          <span className="font-medium">{strength}%</span>
        </div>
      </div>

      {/* Signals */}
      {displaySignals.length > 0 && (
        <div className="space-y-3 pt-2">
          {displaySignals.map((signal, idx) => (
            <div
              key={idx}
              className={`p-3 ${getTrendBg(signal.type.includes("buy") ? "↗" : "↘")}`}
            >
              <div className="text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground uppercase tracking-wide">
                    {signal.source}
                  </span>
                  <span className="font-medium">
                    Ймовірність: {signal.prob}%
                  </span>
                </div>
                <div className="font-medium">
                  {signal.type.includes("buy") ? "Buy" : "Sell"} {signal.type.includes("stop") ? "<" : "@"} {signal.entry.toFixed(5)}
                </div>
                <div className="text-muted-foreground">
                  SL {signal.sl.toFixed(5)} | TP1 {signal.tp1.toFixed(5)}
                  {signal.tp2 && ` / TP2 ${signal.tp2.toFixed(5)}`}
                </div>
                {signal.notes && (
                  <div className="text-muted-foreground italic pt-1">
                    {signal.notes}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {displaySignals.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-4">
          Немає активних сигналів
        </div>
      )}
    </div>
  );
};
