import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { PairCard } from "@/components/PairCard";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { generateASCII, copyToClipboard } from "@/utils/asciiExport";
import { Copy, RefreshCw, Activity } from "lucide-react";
import { getLatestPrices, updatePricesFromAPI } from "@/lib/forexDB";
import { getFeaturesBySymbol, getTrendMatrix, calculateTrendStrength, getOverallTrend, fullUpdate, getMarketMode, generateRangeSignals } from "@/lib/indicators";
import { useAuth } from "@/contexts/AuthContext";
import { useMarketStatus } from "@/hooks/useMarketStatus";

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
  const [nextRefreshIn, setNextRefreshIn] = useState(300); // 5 minutes in seconds
  const [autoRecovered, setAutoRecovered] = useState(false);
  const { toast } = useToast();
  const { user, signInWithGoogle, credits } = useAuth();
  const marketStatus = useMarketStatus();

  // Fetch data from database with real indicators
  const fetchRealData = async () => {
    setIsLoading(true);
    console.log("🔄 Fetching Forex data with indicators...");
    
    try {
      const symbols = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "NZD/USD", "USD/CAD"];
      console.log("📊 Fetching data for pairs:", symbols);
      
      // Get latest prices from database
      const dbPrices = await getLatestPrices(symbols);
      console.log("✅ DB prices:", dbPrices);
      
const realData = await Promise.all(symbols.map(async (symbol) => {
  const priceData = dbPrices[symbol];
  
  if (!priceData) {
    console.warn(`⚠️ No price data for ${symbol} in DB`);
    return null;
  }

  // Get real features from database
  const features = await getFeaturesBySymbol(symbol);
  console.log(`📊 Features for ${symbol}:`, features);
  
  // Get trend matrix from real indicators
  const trend_matrix = getTrendMatrix(features);
  const overallTrend = getOverallTrend(trend_matrix);
  const strength = calculateTrendStrength(trend_matrix);
  const marketMode = getMarketMode(features);

  const price = priceData.price;
  let signals: any[] = [];

  if (features.M15) {
    if (marketMode === "trending" && (features.M15.adx_14 ?? 0) >= 15 && overallTrend !== '→') {
      // TRENDING MODE - Trend following signals
      const isBuy = overallTrend === '↗';
      signals.push({
        type: isBuy ? "buy_stop" : "sell_stop",
        entry: isBuy ? price + 0.002 : price - 0.002,
        sl: isBuy ? price - 0.001 : price + 0.001,
        tp1: isBuy ? price + 0.004 : price - 0.004,
        tp2: isBuy ? price + 0.006 : price - 0.006,
        prob: Math.min(50 + strength, 75),
        source: "Rule-Only",
        notes: features.M15 
          ? `Тренд: ADX ${features.M15.adx_14?.toFixed(1)}, RSI ${features.M15.rsi_14?.toFixed(1)}`
          : undefined,
      });
      if (mode === "hybrid") {
        signals.push({
          type: isBuy ? "buy_stop" : "sell_stop",
          entry: isBuy ? price + 0.002 : price - 0.002,
          sl: isBuy ? price - 0.001 : price + 0.001,
          tp1: isBuy ? price + 0.004 : price - 0.004,
          tp2: isBuy ? price + 0.006 : price - 0.006,
          prob: Math.min(60 + strength, 85),
          source: "Rule+AI",
          notes: `Тренд узгоджений ${Object.values(trend_matrix).filter(t => t === overallTrend).length}/4 ТФ`,
        });
      }
    } else if (marketMode === "ranging") {
      // RANGING MODE - Range trading signals even if ATR=0/RSI=50
      signals = generateRangeSignals(price, features.M15, mode);
    } else {
      console.log(`⚠️ ${symbol}: Insufficient trend strength for signals`);
    }
  } else {
    console.log(`⚠️ ${symbol}: Missing M15 features`);
  }

  return {
    pair: symbol,
    price,
    trend_matrix,
    trend: overallTrend,
    strength,
    signals,
  };
}));

const validData = realData.filter(d => d !== null);
console.log(`✅ Valid data received: ${validData.length}/${symbols.length} pairs`);

if (validData.length > 0) {
  setPairData(validData as any);
  toast({
    title: "Дані оновлено",
    description: `Оновлено ${validData.length} пар з реальними індикаторами`,
  });
} else {
  throw new Error("No valid data in database");
}
} catch (error) {
  console.error("❌ Error fetching data:", error);
  toast({
    title: "Використовуються демо-дані",
    description: "База даних порожня або дані недостатні. Спробую завантажити історію автоматично...",
    variant: "default",
  });
  if (!autoRecovered) {
    const res = await fullUpdate();
    setAutoRecovered(true);
    if (res.success) {
      await fetchRealData();
      return;
    }
  }
  setPairData(generateMockData());
} finally {
  setIsLoading(false);
  console.log("🏁 Fetch complete");
}
  };

  // Full update: fetch OHLCV + calculate indicators
  const handleFullUpdate = async () => {
    setIsLoading(true);
    setAiActive(true);
    toast({
      title: "🔄 Повне оновлення...",
      description: "Завантаження історичних даних + обчислення індикаторів",
    });

    const result = await fullUpdate();
    
    if (result.success) {
      toast({
        title: "✅ Індикатори оновлено",
        description: result.message,
      });
      // Refresh display with new indicators
      await fetchRealData();
    } else {
      toast({
        title: "❌ Помилка оновлення",
        description: result.message,
        variant: "destructive",
      });
    }
    
    setIsLoading(false);
    setAiActive(false);
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

    // Countdown timer (every second)
    const countdownInterval = setInterval(() => {
      setNextRefreshIn(prev => {
        if (prev <= 1) {
          // Reset to 5 minutes and trigger refresh if market is open
          if (marketStatus.isOpen) {
            fetchRealData();
          }
          return 300;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      clearInterval(countdownInterval);
    };
  }, [marketStatus.isOpen]);

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
        nextRefreshIn={nextRefreshIn}
      />

        <main className="space-y-6">
          <div className="flex justify-between items-center mb-4">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              {mode === "hybrid" && aiActive && (
                <>
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span>AI активний</span>
                  <span>•</span>
                </>
              )}
              {user && credits !== null && (
                <span>Кредитів: {credits}</span>
              )}
            </div>
            <div className="flex gap-2">
<Button 
  variant="default" 
  size="sm"
  onClick={handleFullUpdate}
  disabled={isLoading}
  className={`gap-2`}
>
  <Activity className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
  {isLoading ? 'Оновлення...' : 'Завантажити історію'}
</Button>
<Button 
  variant="outline" 
  size="sm"
  onClick={handleManualRefresh}
  disabled={isLoading}
  className={`gap-2`}
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
