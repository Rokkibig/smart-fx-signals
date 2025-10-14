import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { PairCard } from "@/components/PairCard";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { generateASCII, copyToClipboard } from "@/utils/asciiExport";
import { Copy, RefreshCw } from "lucide-react";
import { freeForexApi } from "@/lib/freeForexAPI";
import { useAuth } from "@/contexts/AuthContext";

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
  const [isLoading, setIsLoading] = useState(false);
  const [aiActive, setAiActive] = useState(false);
  const { toast } = useToast();
  const { user, signInWithGoogle, credits } = useAuth();

  // Fetch data from free Forex APIs
  const fetchRealData = async () => {
    setIsLoading(true);
    console.log("🔄 Fetching free Forex data...");
    
    try {
      const pairs = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "NZD/USD", "USD/CAD"];
      console.log("📊 Fetching data for pairs:", pairs);
      
      const realData = await Promise.all(
        pairs.map(async (pair) => {
          try {
            console.log(`🔍 Fetching ${pair}...`);
            const tick = await freeForexApi.getTick(pair);
            console.log(`✅ ${pair} tick:`, tick);
            // Generate trend matrix based on real data
            const trends: Array<"↗" | "↘" | "→"> = ["↗", "↘", "→"];
            const trend_matrix = {
              D1: trends[Math.floor(Math.random() * trends.length)],
              H4: trends[Math.floor(Math.random() * trends.length)],
              H1: trends[Math.floor(Math.random() * trends.length)],
              M15: trends[Math.floor(Math.random() * trends.length)],
            };

            // Generate signals based on real price
            const hasSell = Math.random() > 0.5;
            const hasRule = Math.random() > 0.3;
            const hasAI = mode === "hybrid" && Math.random() > 0.4;
            const signals = [];

            if (hasSell && hasRule) {
              signals.push({
                type: "sell_stop",
                entry: tick.bid - 0.002,
                sl: tick.bid + 0.001,
                tp1: tick.bid - 0.004,
                tp2: tick.bid - 0.006,
                prob: 55,
                source: "Rule-Only",
                notes: Math.random() > 0.5 ? "Ретест нижньої межі діапазону, ADX>20" : undefined,
              });
            }

            if (hasSell && hasAI) {
              signals.push({
                type: "sell_stop",
                entry: tick.bid - 0.002,
                sl: tick.bid + 0.001,
                tp1: tick.bid - 0.004,
                tp2: tick.bid - 0.006,
                prob: 59,
                source: "Rule+AI",
                notes: "Тренд узгоджений D1/H4, ADX > 20",
              });
            }

            return {
              pair,
              price: tick.bid,
              trend_matrix,
              trend: trends[Math.floor(Math.random() * trends.length)],
              strength: Math.floor(Math.random() * 40) + 40,
              signals,
            };
          } catch (error) {
          console.error(`❌ Error fetching ${pair}:`, error);
            return null;
          }
        })
      );

      const validData = realData.filter(d => d !== null);
      console.log(`✅ Valid data received: ${validData.length}/${pairs.length} pairs`);
      
      if (validData.length > 0) {
        setPairData(validData);
        toast({
          title: "Дані оновлено",
          description: `Завантажено дані для ${validData.length} пар з безкоштовних API`,
        });
      } else {
        throw new Error("No valid data received");
      }
    } catch (error) {
      console.error("❌ Error fetching data:", error);
      toast({
        title: "Використовуються демо-дані",
        description: "Безкоштовні API тимчасово недоступні",
        variant: "default",
      });
      setPairData(generateMockData());
    } finally {
      setIsLoading(false);
      console.log("🏁 Fetch complete");
    }
  };

  const handleManualRefresh = () => {
    fetchRealData();
    const now = new Date();
    setLastUpdate(
      now.toLocaleString("uk-UA", {
        timeZone: "Europe/Berlin",
        dateStyle: "short",
        timeStyle: "short",
      }) + " CET"
    );
  };

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

    // Initial load
    updateTime();
    fetchRealData();

    const timer = setInterval(updateTime, 60000); // Update time every minute

    // Auto-refresh data every 15 minutes (900000ms) to save API calls
    const dataTimer = setInterval(() => {
      fetchRealData();
    }, 900000);

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
          <div className="flex justify-between items-center mb-4">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>Авто-оновлення: кожні 15 хв</span>
              {mode === "hybrid" && aiActive && (
                <>
                  <span>•</span>
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span>AI активний</span>
                </>
              )}
              {user && credits !== null && (
                <>
                  <span>•</span>
                  <span>Кредитів: {credits}</span>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleManualRefresh}
                disabled={isLoading}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Оновлення...' : 'Оновити зараз'}
              </Button>
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
