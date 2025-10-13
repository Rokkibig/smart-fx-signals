import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { PairCard } from "@/components/PairCard";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { generateASCII, copyToClipboard } from "@/utils/asciiExport";
import { Copy, RefreshCw } from "lucide-react";
import { mt5Api } from "@/lib/api";

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
  const [mt5Connected, setMt5Connected] = useState(false);
  const { toast } = useToast();

  // Fetch real MT5 data
  const fetchRealData = async () => {
    setIsLoading(true);
    console.log("🔄 Fetching real MT5 data...");
    console.log("🌐 API URL:", import.meta.env.VITE_MT5_API_URL || "http://84.247.166.52:8000");
    console.log("🔒 Current protocol:", window.location.protocol);
    
    try {
      // Check MT5 status first
      console.log("📡 Checking MT5 status...");
      console.log("🔗 Making request to:", `${import.meta.env.VITE_MT5_API_URL || "http://84.247.166.52:8000"}/api/status`);
      
      const status = await mt5Api.getStatus();
      console.log("✅ MT5 status:", status);
      setMt5Connected(status.mt5_connected);
      
      if (!status.mt5_connected) {
        console.warn("⚠️ MT5 not connected, using demo data");
        toast({
          title: "MT5 не підключено",
          description: "Використовуються демо-дані. Перевірте підключення до MT5 сервера.",
          variant: "destructive",
        });
        setPairData(generateMockData());
        return;
      }

      const pairs = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "NZDUSD", "USDCAD"];
      console.log("📊 Fetching data for pairs:", pairs);
      
      const realData = await Promise.all(
        pairs.map(async (pair) => {
          try {
            console.log(`🔍 Fetching ${pair}...`);
            const tick = await mt5Api.getTick(pair);
            console.log(`✅ ${pair} tick:`, tick);
            
            const ohlcv = await mt5Api.getOHLCV(pair, "H1", 100);
            console.log(`✅ ${pair} OHLCV bars:`, ohlcv.length);
            
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
            const hasAI = Math.random() > 0.4;
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
              pair: pair.replace("USD", "/USD").replace(/(\w{3})(\w{3})/, "$1/$2"),
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
          description: `Завантажено реальні дані для ${validData.length} пар з MT5`,
        });
      } else {
        throw new Error("No valid data received");
      }
    } catch (error) {
      console.error("❌ Error fetching real data:", error);
      
      // More specific error messages
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error details:", errorMessage);
      console.error("Error type:", error?.constructor?.name);
      
      // Check if it's a mixed content issue
      const isHttpsToHttp = window.location.protocol === 'https:' && 
                            (import.meta.env.VITE_MT5_API_URL || "http://84.247.166.52:8000").startsWith('http:');
      
      if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
        if (isHttpsToHttp) {
          toast({
            title: "⚠️ Mixed Content Blocked",
            description: "Браузер блокує HTTP запити з HTTPS сайту. Сервер потребує HTTPS (SSL сертифікат) або використайте Edge Function проксі.",
            variant: "destructive",
          });
          console.error("🔒 MIXED CONTENT: HTTPS site trying to access HTTP API");
          console.error("💡 Solution 1: Enable HTTPS on your MT5 server (recommended)");
          console.error("💡 Solution 2: Use Supabase Edge Function as proxy");
          console.error("💡 Solution 3: For development only - use HTTP version of this site");
        } else {
          toast({
            title: "Помилка мережі",
            description: "Не вдалося підключитися до MT5 API. Перевірте: 1) Чи працює сервер 2) CORS налаштування 3) Firewall",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Помилка завантаження",
          description: `Помилка: ${errorMessage}. Використовуються демо-дані.`,
          variant: "destructive",
        });
      }
      
      setPairData(generateMockData());
      setMt5Connected(false);
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

    // Auto-refresh data every 5 minutes (300000ms) to save API calls
    const dataTimer = setInterval(() => {
      fetchRealData();
    }, 300000);

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
              {mt5Connected ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-success" />
                  MT5 підключено
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-destructive" />
                  MT5 відключено (демо-дані)
                </>
              )}
              <span>•</span>
              <span>Авто-оновлення: кожні 5 хв</span>
              {mode === "hybrid" && (
                <>
                  <span>•</span>
                  <span>AI запити активні</span>
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
