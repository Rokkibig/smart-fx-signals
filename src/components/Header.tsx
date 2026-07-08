import { Button } from "./ui/button";
import { LogIn, User, Crown, ImageIcon, Newspaper, LineChart } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

interface HeaderProps {
  mode: "rule" | "hybrid";
  onModeChange: (mode: "rule" | "hybrid") => void;
  lastUpdate: string;
  autoRefresh: boolean;
  nextRefreshIn: number; // seconds until next refresh
}

export const Header = ({ mode, onModeChange, lastUpdate, autoRefresh, nextRefreshIn }: HeaderProps) => {
  const { user, signInWithGoogle, subscription } = useAuth();
  const navigate = useNavigate();
  const marketStatus = useMarketStatus();
  const [countdown, setCountdown] = useState(nextRefreshIn);
  const [quality, setQuality] = useState<number | null>(null);

  useEffect(() => {
    const loadQuality = async () => {
      const { data } = await supabase
        .from("forecast_stats")
        .select("avg_accuracy, total_forecasts");
      if (!data || data.length === 0) return;
      const totals = data.reduce((s, r: any) => s + (r.total_forecasts || 0), 0);
      if (!totals) return;
      const weighted = data.reduce(
        (s, r: any) => s + (Number(r.avg_accuracy) || 0) * (r.total_forecasts || 0),
        0
      );
      setQuality(Math.round(weighted / totals));
    };
    loadQuality();
    const iv = setInterval(loadQuality, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const qualityColor =
    quality === null
      ? "text-muted-foreground border-muted-foreground/30"
      : quality >= 70
      ? "text-success border-success/40"
      : quality >= 50
      ? "text-warning border-warning/40"
      : "text-destructive border-destructive/40";

  useEffect(() => {
    setCountdown(nextRefreshIn);
  }, [nextRefreshIn]);

  useEffect(() => {
    if (!autoRefresh || !marketStatus.isOpen) return;
    
    const timer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefresh, marketStatus.isOpen]);

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <header className="dotted-border-b pb-6 mb-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="text-3xl tracking-tight hover:text-primary transition-colors text-left"
            >
              FX Signal Suite
            </button>
            <span
              title="Якість прогнозів: середня точність за оціненими прогнозами"
              className={`text-xs px-2 py-0.5 rounded-full border font-mono ${qualityColor}`}
            >
              {quality === null ? "— %" : `${quality}%`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/market-review')}>
              <Newspaper className="w-4 h-4 mr-2" />
              Огляд
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/chart-analysis')}>
              <ImageIcon className="w-4 h-4 mr-2" />
              AI-графік
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/pricing')}>
              <Crown className="w-4 h-4 mr-2" />
              Тарифи
            </Button>
            {user ? (
              <Button variant="outline" size="sm" onClick={() => navigate('/profile')}>
                <User className="w-4 h-4 mr-2" />
                {subscription.subscribed ? subscription.tier : 'Профіль'}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={signInWithGoogle}>
                <LogIn className="w-4 h-4 mr-2" />
                Увійти з Google
              </Button>
            )}
          </div>
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <div className="flex items-center gap-4 flex-wrap">
            <button 
              onClick={() => {
                if (mode === "rule") {
                  if (!user) {
                    toast.error('Увійдіть, щоб увімкнути Hybrid AI');
                    return;
                  }
                  if (!subscription.subscribed) {
                    toast.error('Hybrid AI доступний у Pro/VIP', {
                      description: 'Перейдіть на тарифи',
                      action: { label: 'Тарифи', onClick: () => navigate('/pricing') },
                    });
                    return;
                  }
                }
                onModeChange(mode === "rule" ? "hybrid" : "rule");
              }}
              className="text-foreground hover:text-primary transition-colors"
            >
              Режим: {mode === "rule" ? "Rule-Only" : "Rule+AI"}
            </button>
            <span className="text-xs">•</span>
            <span className={!marketStatus.isOpen ? "text-muted-foreground/50" : ""}>
              Оновлено: {lastUpdate}
            </span>
            {autoRefresh && (
              <>
                <span className="text-xs">•</span>
                <span className={`flex items-center gap-1.5 ${!marketStatus.isOpen ? "text-muted-foreground/50" : ""}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${marketStatus.isOpen ? "bg-success animate-pulse" : "bg-muted-foreground/30"}`} />
                  Авто-оновлення ({formatCountdown(countdown)})
                </span>
                {!marketStatus.isOpen && (
                  <>
                    <span className="text-xs">•</span>
                    <span className="text-muted-foreground/70">
                      Ринок відкриється через {marketStatus.timeUntilOpen}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
