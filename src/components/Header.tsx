interface HeaderProps {
  mode: "rule" | "hybrid";
  onModeChange: (mode: "rule" | "hybrid") => void;
  lastUpdate: string;
  autoRefresh: boolean;
}

export const Header = ({ mode, onModeChange, lastUpdate, autoRefresh }: HeaderProps) => {
  return (
    <header className="dotted-border-b pb-6 mb-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl tracking-tight">FX Signal Suite</h1>
        <div className="text-sm text-muted-foreground space-y-1">
          <div>Сигнали на вимогу — реальні дані MT5</div>
          <div className="flex items-center gap-4 flex-wrap">
            <button 
              onClick={() => onModeChange(mode === "rule" ? "hybrid" : "rule")}
              className="text-foreground hover:text-primary transition-colors"
            >
              Режим: {mode === "rule" ? "Rule-Only" : "Rule+AI"}
            </button>
            <span className="text-xs">•</span>
            <span>Оновлено: {lastUpdate}</span>
            {autoRefresh && (
              <>
                <span className="text-xs">•</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  Авто-оновлення
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
