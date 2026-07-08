import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/components/ui/sonner";
import { Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

interface Props {
  pair: string;
  side: "LONG" | "SHORT";
  entry: number;
  sl: number;
  tp: number;
  sourceType?: string;
  sourceRef?: string;
  snapshot?: Record<string, unknown>;
  balance?: number;
}

const pipSizeFor = (pair: string) => (pair.includes("JPY") ? 0.01 : 0.0001);
const PIP_VALUE_PER_LOT = 10;

export const DemoTradeButton = ({ pair, side, entry, sl, tp, sourceType, sourceRef, snapshot, balance = 1000 }: Props) => {
  const { user, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"risk" | "lot">("risk");
  const [riskPct, setRiskPct] = useState("1");
  const [lotInput, setLotInput] = useState("0.10");
  const [submitting, setSubmitting] = useState(false);

  const pipSize = pipSizeFor(pair);
  const slDistancePips = Math.abs(entry - sl) / pipSize;
  const tpDistancePips = Math.abs(tp - entry) / pipSize;

  let lot = 0;
  let riskUsd = 0;
  let profitUsd = 0;
  if (mode === "risk") {
    const r = Math.min(5, Math.max(0.1, Number(riskPct) || 1));
    riskUsd = balance * (r / 100);
    lot = slDistancePips > 0 ? riskUsd / (slDistancePips * PIP_VALUE_PER_LOT) : 0;
    lot = Math.max(0.01, Math.round(lot * 100) / 100);
    riskUsd = lot * slDistancePips * PIP_VALUE_PER_LOT;
  } else {
    lot = Math.max(0.01, Number(lotInput) || 0.01);
    riskUsd = lot * slDistancePips * PIP_VALUE_PER_LOT;
  }
  profitUsd = lot * tpDistancePips * PIP_VALUE_PER_LOT;
  const rr = riskUsd > 0 ? profitUsd / riskUsd : 0;

  const handleOpen = () => {
    if (!user) {
      toast.error("Увійдіть, щоб торгувати демо", {
        action: { label: "Google", onClick: () => signInWithGoogle() },
      });
      return;
    }
    setOpen(true);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Сесія не знайдена. Увійдіть ще раз.");
      const { data, error } = await supabase.functions.invoke("open-demo-trade", {
        body: {
          pair,
          side,
          entry,
          sl,
          tp,
          risk_pct: mode === "risk" ? Number(riskPct) : undefined,
          lot: mode === "lot" ? Number(lotInput) : undefined,
          source_type: sourceType,
          source_ref: sourceRef,
          snapshot,
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Демо-угода відкрита", {
        description: `${pair} ${side} · лот ${(data as any).trade.lot}`,
        action: { label: "Мої угоди", onClick: () => navigate("/demo") },
      });
      setOpen(false);
    } catch (e: any) {
      toast.error("Не вдалося відкрити угоду", { description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" className="gap-2" onClick={handleOpen}>
        <Play className="w-3.5 h-3.5" />
        Торгувати демо
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Демо: {side === "LONG" ? "Buy" : "Sell"} {pair}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div><div className="text-muted-foreground">Entry</div><div className="font-mono">{entry.toFixed(5)}</div></div>
              <div><div className="text-muted-foreground">SL</div><div className="font-mono text-destructive">{sl.toFixed(5)}</div></div>
              <div><div className="text-muted-foreground">TP</div><div className="font-mono text-success">{tp.toFixed(5)}</div></div>
            </div>

            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "risk" | "lot")} className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="risk" id="mode-risk" />
                <Label htmlFor="mode-risk" className="cursor-pointer">Фіксований ризик (рекомендовано)</Label>
              </div>
              {mode === "risk" && (
                <div className="pl-6">
                  <Label className="text-xs text-muted-foreground">Ризик, % від балансу</Label>
                  <Input
                    type="number" step="0.1" min="0.1" max="5"
                    value={riskPct} onChange={(e) => setRiskPct(e.target.value)}
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <RadioGroupItem value="lot" id="mode-lot" />
                <Label htmlFor="mode-lot" className="cursor-pointer">Свій лот</Label>
              </div>
              {mode === "lot" && (
                <div className="pl-6">
                  <Label className="text-xs text-muted-foreground">Лот (стандартні лоти)</Label>
                  <Input
                    type="number" step="0.01" min="0.01"
                    value={lotInput} onChange={(e) => setLotInput(e.target.value)}
                  />
                </div>
              )}
            </RadioGroup>

            <div className="rounded border border-border p-3 text-xs space-y-1 bg-muted/30">
              <div className="flex justify-between"><span className="text-muted-foreground">Лот</span><span className="font-mono">{lot.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ризик</span><span className="font-mono text-destructive">-${riskUsd.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Потенційний прибуток</span><span className="font-mono text-success">+${profitUsd.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">R:R</span><span className="font-mono">{rr.toFixed(2)}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Скасувати</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Відкриваємо…" : "Відкрити угоду"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
