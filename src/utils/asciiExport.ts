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
  trend_matrix: {
    D1: string;
    H4: string;
    H1: string;
    M15: string;
  };
  trend: string;
  strength: number;
  signals: Signal[];
}

export function generateASCII(data: PairData[], timestamp: string): string {
  let output = `Дата/час: ${timestamp}\n`;
  output += `Джерело котирувань: MT5 (live). Новини high-impact: врахована пауза ±30 хв.\n\n`;

  for (const pair of data) {
    const { pair: symbol, price, trend_matrix, trend, strength, signals } = pair;
    
    output += `${symbol} (D1${trend_matrix.D1} | H4${trend_matrix.H4} | H1${trend_matrix.H1} | M15${trend_matrix.M15})  Тренд: ${trend}  Сила: ${strength}%\n`;

    // Rule-Only signals
    const ruleSignals = signals.filter(s => s.source === "Rule-Only");
    if (ruleSignals.length > 0) {
      output += `Rule-Only:\n`;
      for (const sig of ruleSignals) {
        const side = sig.type.includes("buy") ? "Buy" : "Sell";
        const operator = sig.type.includes("stop") ? "<" : "@";
        output += `  ${side} ${operator} ${sig.entry.toFixed(5)} | SL ${sig.sl.toFixed(5)} | TP1 ${sig.tp1.toFixed(5)}`;
        if (sig.tp2) output += ` / TP2 ${sig.tp2.toFixed(5)}`;
        output += ` | Ймовірність: ${sig.prob}%\n`;
        if (sig.notes) output += `  ${sig.notes}\n`;
      }
    }

    // Rule+AI signals
    const aiSignals = signals.filter(s => s.source === "Rule+AI");
    if (aiSignals.length > 0) {
      output += `Rule+AI:\n`;
      for (const sig of aiSignals) {
        const side = sig.type.includes("buy") ? "Buy" : "Sell";
        const operator = sig.type.includes("stop") ? "<" : "@";
        output += `  ${side} ${operator} ${sig.entry.toFixed(5)} | SL ${sig.sl.toFixed(5)} | TP1 ${sig.tp1.toFixed(5)}`;
        if (sig.tp2) output += ` / TP2 ${sig.tp2.toFixed(5)}`;
        output += ` | Ймовірність: ${sig.prob}% (AI ok)\n`;
        if (sig.notes) output += `  ${sig.notes}\n`;
      }
    }

    if (signals.length === 0) {
      output += `  Немає активних сигналів\n`;
    }

    output += `\n`;
  }

  return output;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error("Failed to copy:", err);
    return false;
  }
}
