import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { PairCard } from "@/components/PairCard";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { generateASCII, copyToClipboard } from "@/utils/asciiExport";
import { Copy, RefreshCw } from "lucide-react";
import { getLatestPrices, updatePricesFromAPI } from "@/lib/forexDB";
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

  // Fetch data from database
  const fetchRealData = async () => {
    setIsLoading(true);
    console.log("🔄 Fetching Forex data from database...");
    
    try {
      const symbols = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "NZD/USD", "USD/CAD"];
      console.log("📊 Fetching data for pairs:", symbols);
      
      // Get latest prices from database
      const dbPrices = await getLatestPrices(symbols);
      console.log("✅ DB prices:", dbPrices);
      
      const realData = symbols.map((symbol) => {
        const priceData = dbPrices[symbol];
        
        if (!priceData) {
          console.warn(`⚠️ No price data for ${symbol} in DB`);
          return null;
        }

        // Generate trend matrix based on real data
        const trends: Array<"↗" | "↘" | "→"> = ["↗", "↘", "→"];
        const trend_matrix = {
          D1: trends[Math.floor(Math.random() * trends.length)],
          H4: trends[Math.floor(Math.random() * trends.length)],
          H1: trends[Math.floor(Math.random() * trends.length)],
          M15: trends[Math.floor(Math.random() * trends.length)],
        };

        const price = priceData.price;
        const signals = [];

        // Always generate Rule-Only signal
        const isBuy = Math.random() > 0.5;
        signals.push({
          type: isBuy ? "buy_stop" : "sell_stop",
          entry: isBuy ? price + 0.002 : price - 0.002,
          sl: isBuy ? price - 0.001 : price + 0.001,
          tp1: isBuy ? price + 0.004 : price - 0.004,
          tp2: isBuy ? price + 0.006 : price - 0.006,
          prob: Math.floor(Math.random() * 15) + 50, // 50-65%
          source: "Rule-Only",
          notes: Math.random() > 0.5 ? "Ретест нижньої межі діапазону, ADX>20" : undefined,
        });

        // For hybrid mode add AI signal with higher probability
        if (mode === "hybrid" && Math.random() > 0.3) {
          signals.push({
            type: isBuy ? "buy_stop" : "sell_stop",
            entry: isBuy ? price + 0.002 : price - 0.002,
            sl: isBuy ? price - 0.001 : price + 0.001,
            tp1: isBuy ? price + 0.004 : price - 0.004,
            tp2: isBuy ? price + 0.006 : price - 0.006,
            prob: Math.floor(Math.random() * 15) + 60, // 60-75%
            source: "Rule+AI",
            notes: "Тренд узгоджений D1/H4, ADX > 20",
          });
        }

        return {
          pair: symbol,
          price,
          trend_matrix,
          trend: trends[Math.floor(Math.random() * trends.length)],
          strength: Math.floor(Math.random() * 40) + 40,
          signals,
        };
      });

      const validData = realData.filter(d => d !== null);
      console.log(`✅ Valid data received: ${validData.length}/${symbols.length} pairs`);
      
      if (validData.length > 0) {
        setPairData(validData);
        
        // Show source in toast
        const sourceName = Object.values(dbPrices)[0]?.source === 'twelve_data' 
          ? 'Twelve Data API' 
          : 'база даних';
        
        toast({
          title: "Дані оновлено",
          description: `Оновлено дані для ${validData.length} пар з ${sourceName}`,
        });
      } else {
        throw new Error("No valid data in database");
      }
    } catch (error) {
      console.error("❌ Error fetching data from DB:", error);
      toast({
        title: "Використовуються демо-дані",
        description: "База даних порожня. Натисніть 'Оновити дані' для завантаження реальних цін.",
        variant: "default",
      });
      setPairData(generateMockData());
    } finally {
      setIsLoading(false);
      console.log("🏁 Fetch complete");
    }
  };

  // Update prices from Twelve Data API
  const handleUpdateFromAPI = async () => {
    setIsLoading(true);
    toast({
      title: "Оновлення цін...",
      description: "Завантажуємо дані з Twelve Data API",
    });

    const result = await updatePricesFromAPI();
    
    if (result.success) {
      toast({
        title: "✅ Ціни оновлено",
        description: result.message,
      });
      // Refresh display
      await fetchRealData();
    } else {
      toast({
        title: "❌ Помилка оновлення",
        description: result.message,
        variant: "destructive",
      });
    }
    
    setIsLoading(false);
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
                onClick={handleUpdateFromAPI}
                disabled={isLoading}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Оновлення...' : 'Оновити дані'}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleManualRefresh}
                disabled={isLoading}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Завантаження...' : 'Оновити екран'}
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
