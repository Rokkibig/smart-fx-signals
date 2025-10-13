interface HeaderProps {
  mode: "rule" | "hybrid";
  lastUpdate: string;
  autoRefresh: boolean;
}

export const Header = ({ mode, lastUpdate, autoRefresh }: HeaderProps) => {
  return (
    <header className="dotted-border-b pb-6 mb-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl tracking-tight">FX Signal Suite</h1>
        <div className="text-sm text-muted-foreground space-y-1">
          <div>Сигнали на вимогу — реальні дані MT5, без розкладу</div>
          <div className="flex items-center gap-4 flex-wrap">
            <span>Режим: {mode === "rule" ? "Rule-Only" : "Rule+AI"}</span>
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
