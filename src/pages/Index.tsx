import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { PairCard } from "@/components/PairCard";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { generateASCII, copyToClipboard } from "@/utils/asciiExport";
import { Copy } from "lucide-react";

// Mock data for demo - replace with actual API calls
const generateMockData = () => {
  const pairs = [
    "EUR/USD",
    "GBP/USD",
    "USD/JPY",
    "USD/CHF",
    "AUD/USD",
    "NZD/USD",
    "USD/CAD",
  ];

  const trends: Array<"↗" | "↘" | "→"> = ["↗", "↘", "→"];
  
  return pairs.map((pair) => {
    const trend = trends[Math.floor(Math.random() * trends.length)];
    const hasSell = Math.random() > 0.5;
    const hasRule = Math.random() > 0.3;
    const hasAI = Math.random() > 0.4;

    const basePrice = pair.includes("JPY") ? 145.5 : 1.16;
    const price = basePrice + (Math.random() - 0.5) * 0.02;

    const signals = [];
    
    if (hasSell && hasRule) {
      signals.push({
        type: "sell_stop",
        entry: price - 0.002,
        sl: price + 0.001,
        tp1: price - 0.004,
        tp2: price - 0.006,
        prob: 55,
        source: "Rule-Only",
        notes: Math.random() > 0.5 ? "Ретест нижньої межі діапазону, ADX>20" : undefined,
      });
    }

    if (hasSell && hasAI) {
      signals.push({
        type: "sell_stop",
        entry: price - 0.002,
        sl: price + 0.001,
        tp1: price - 0.004,
        tp2: price - 0.006,
        prob: 59,
        source: "Rule+AI",
        notes: "Тренд узгоджений D1/H4, ADX > 20",
      });
    }

    return {
      pair,
      price,
      trend_matrix: {
        D1: trends[Math.floor(Math.random() * trends.length)],
        H4: trends[Math.floor(Math.random() * trends.length)],
        H1: trends[Math.floor(Math.random() * trends.length)],
        M15: trends[Math.floor(Math.random() * trends.length)],
      },
      trend,
      strength: Math.floor(Math.random() * 40) + 40,
      signals,
    };
  });
};

const Index = () => {
  const [mode, setMode] = useState<"rule" | "hybrid">("hybrid");
  const [lastUpdate, setLastUpdate] = useState("");
  const [pairData, setPairData] = useState(generateMockData());
  const { toast } = useToast();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLastUpdate(
        now.toLocaleString("uk-UA", {
          timeZone: "Europe/Berlin",
          dateStyle: "short",
          timeStyle: "short",
        }) + " CET"
      );
    };

    updateTime();
    const timer = setInterval(updateTime, 30000);

    // Auto-refresh data every 30 seconds
    const dataTimer = setInterval(() => {
      setPairData(generateMockData());
    }, 30000);

    return () => {
      clearInterval(timer);
      clearInterval(dataTimer);
    };
  }, []);

  const handleCopyASCII = async () => {
    const ascii = generateASCII(pairData, lastUpdate);
    const success = await copyToClipboard(ascii);
    
    if (success) {
      toast({
        title: "Скопійовано",
        description: "ASCII формат скопійовано в буфер обміну",
      });
    } else {
      toast({
        title: "Помилка",
        description: "Не вдалося скопіювати",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <Header 
          mode={mode} 
          onModeChange={setMode}
          lastUpdate={lastUpdate} 
          autoRefresh={true} 
        />

        <main className="space-y-6">
          <div className="flex justify-end mb-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleCopyASCII}
              className="gap-2"
            >
              <Copy className="w-4 h-4" />
              Копіювати ASCII
            </Button>
          </div>

          <div className="grid gap-6">
            {pairData.map((data) => (
              <PairCard key={data.pair} data={data} mode={mode} />
            ))}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
};

export default Index;
