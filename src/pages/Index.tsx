import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { PairCard } from "@/components/PairCard";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { generateASCII, copyToClipboard } from "@/utils/asciiExport";
import { Copy, RefreshCw, Activity } from "lucide-react";
import { getLatestPrices, updatePricesFromAPI, insertPrice } from "@/lib/forexDB";
import { getFeaturesBySymbol, getTrendMatrix, calculateTrendStrength, getOverallTrend, fullUpdate, getMarketMode, generateRangeSignals } from "@/lib/indicators";
import { freeForexApi } from "@/lib/freeForexAPI";
import { useAuth } from "@/contexts/AuthContext";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [mode, setMode] = useState<"rule" | "hybrid">("hybrid");
  const [lastUpdate, setLastUpdate] = useState("");
  const [pairData, setPairData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiActive, setAiActive] = useState(false);
  const [nextRefreshIn, setNextRefreshIn] = useState(300); // 5 minutes in seconds
  const [autoRecovered, setAutoRecovered] = useState(false);
  const [superMode, setSuperMode] = useState(false); // Режим СУПЕР
  
  const { user, signInWithGoogle, credits } = useAuth();
  const marketStatus = useMarketStatus();

  const fetchRealData = async () => {
    setIsLoading(true);
    
    try {
      const symbols = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "NZD/USD", "USD/CAD"];
      let dbPrices = await getLatestPrices(symbols);

      // Якщо дані відсутні або застарілі (>5 хв) — оновлюємо через бекенд
      const now = Date.now();
      const THRESHOLD = 5 * 60 * 1000;
      const missingOrStale = symbols.filter((s) => {
        const p = (dbPrices as any)[s];
        if (!p) return true;
        const ts = new Date(p.price_timestamp).getTime();
        return !ts || Number.isNaN(ts) || now - ts > THRESHOLD;
      });

      if (missingOrStale.length > 0) {
        await updatePricesFromAPI().catch(() => undefined);
        dbPrices = await getLatestPrices(symbols);
      }

      // Фолбек: напряму з публічних провайдерів і збереження в БД
      for (const s of symbols) {
        if (!dbPrices[s]) {
          try {
            const tick = await freeForexApi.getTick(s);
            await insertPrice(s, tick.last, tick.bid, tick.ask, tick.volume, tick.spread);
            (dbPrices as any)[s] = {
              symbol: s,
              price: tick.last,
              bid: tick.bid,
              ask: tick.ask,
              volume: tick.volume,
              spread: tick.spread,
              source: 'fallback',
              price_timestamp: new Date().toISOString(),
            };
          } catch (_) {
            // Ігноруємо, просто не покажемо цю пару
          }
        }
      }
      
      const realData = await Promise.all(symbols.map(async (symbol) => {
        const priceData = (dbPrices as any)[symbol];
        if (!priceData) return null;

        const features = await getFeaturesBySymbol(symbol);
        const trend_matrix = getTrendMatrix(features);
        const overallTrend = getOverallTrend(trend_matrix);
        const strength = calculateTrendStrength(trend_matrix);
        const marketMode = getMarketMode(features);
        const price = priceData.price;
        
        const tfForSignals = (features as any).M15 ?? (features as any).H1;
        const signals = tfForSignals 
          ? generateRangeSignals(price, tfForSignals, mode, { 
              marketMode, 
              overallTrend, 
              strength 
            })
          : [];

        return {
          pair: symbol,
          price,
          trend_matrix,
          trend: overallTrend,
          strength,
          signals,
          aiAnalysis: null,
        };
      }));

      const validData = realData.filter(d => d !== null);

      if (validData.length > 0) {
        setPairData(validData as any);
        
        // AI аналіз для Hybrid режиму
        if (mode === "hybrid" && user) {
          setAiActive(true);
          
          const aiPromises = validData.map(async (pairInfo: any) => {
      try {
        const { data: aiData, error: aiError } = await supabase.functions.invoke('analyze-forex-ai', {
          body: {
            pairData: {
              pair: pairInfo.pair,
              price: pairInfo.price,
              trend: pairInfo.trend,
              strength: pairInfo.strength,
              trend_matrix: pairInfo.trend_matrix,
            }
          }
        });

          if (aiError) {
            if (aiError.message?.includes('402')) {
            toast.error("Недостатньо кредитів", {
              description: "AI-аналіз недоступний. Поповніть баланс кредитів.",
            });
          } else if (aiError.message?.includes('429')) {
            toast.error("Ліміт запитів", {
              description: "Забагато запитів. Спробуйте пізніше.",
            });
          }
            return { pair: pairInfo.pair, analysis: null };
          }

          return { pair: pairInfo.pair, analysis: aiData?.analysis || null };
        } catch (err) {
          return { pair: pairInfo.pair, analysis: null };
        }
      });

          const aiResults = await Promise.all(aiPromises);
          
          setPairData(prev => 
            prev.map(p => {
              const aiResult = aiResults.find(r => r.pair === p.pair);
              return { ...p, aiAnalysis: aiResult?.analysis || null };
            })
          );
          
          setAiActive(false);
          const successCount = aiResults.filter(r => r.analysis).length;
          if (successCount > 0) {
            toast.success("AI-аналіз завершено", {
              description: `Проаналізовано ${successCount}/${validData.length} пар`,
            });
          }
        }
        
        toast.success("Дані оновлено", {
          description: `Оновлено ${validData.length} пар`,
        });
      } else {
        throw new Error("Недостатньо даних у базі");
      }
    } catch (error) {
      toast.error("Помилка завантаження даних", {
        description: "Спробуйте завантажити історію вручну",
      });
      
      if (!autoRecovered) {
        const res = await fullUpdate();
        setAutoRecovered(true);
        if (res.success) {
          await fetchRealData();
          return;
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFullUpdate = async () => {
    setIsLoading(true);
    setAiActive(true);
    
    const modeLabel = superMode ? 'СУПЕР режим' : 'Базовий режим';
    const depths = superMode 
      ? 'D1:200, H4:200, H1:400, M15:200' 
      : 'D1:50, H4:100, H1:200, M15:100';
    
    toast("🔄 Завантаження свічок...", {
      description: `${modeLabel}: ${depths}`,
    });

    const result = await fullUpdate(superMode);
    
    if (result.success) {
      toast.success("✅ Дані оновлено", {
        description: result.message,
      });
      // Refresh display with new indicators
      await fetchRealData();
    } else {
      toast.error("❌ Помилка оновлення", {
        description: result.message,
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
      toast.success("Скопійовано", {
        description: "ASCII формат скопійовано в буфер обміну",
      });
    } else {
      toast.error("Помилка", {
        description: "Не вдалося скопіювати",
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
              <span>•</span>
              <Button
                variant={superMode ? "default" : "outline"}
                size="sm"
                onClick={() => setSuperMode(!superMode)}
                className="gap-2"
              >
                {superMode ? "🚀 СУПЕР" : "⚡ Базовий"}
              </Button>
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
