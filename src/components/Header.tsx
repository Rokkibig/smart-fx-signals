import { Button } from "./ui/button";
import { LogIn, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useState, useEffect } from "react";

interface HeaderProps {
  mode: "rule" | "hybrid";
  onModeChange: (mode: "rule" | "hybrid") => void;
  lastUpdate: string;
  autoRefresh: boolean;
  nextRefreshIn: number; // seconds until next refresh
}

export const Header = ({ mode, onModeChange, lastUpdate, autoRefresh, nextRefreshIn }: HeaderProps) => {
  const { user, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const marketStatus = useMarketStatus();
  const [countdown, setCountdown] = useState(nextRefreshIn);

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
          <h1 className="text-3xl tracking-tight">FX Signal Suite</h1>
          {user ? (
            <Button variant="outline" size="sm" onClick={() => navigate('/profile')}>
              <User className="w-4 h-4 mr-2" />
              Профіль
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={signInWithGoogle}>
              <LogIn className="w-4 h-4 mr-2" />
              Увійти з Google
            </Button>
          )}
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <div>Безкоштовні Forex API — Реальні ціни</div>
          <div className="flex items-center gap-4 flex-wrap">
            <button 
              onClick={() => onModeChange(mode === "rule" ? "hybrid" : "rule")}
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
