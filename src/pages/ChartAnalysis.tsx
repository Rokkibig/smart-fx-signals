import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Upload, Sparkles, Image as ImageIcon, X, Coins } from "lucide-react";

const MAX_BYTES = 6 * 1024 * 1024; // 6 MB
const CREDITS_COST = 2;

const ChartAnalysis = () => {
  const navigate = useNavigate();
  const { user, credits, refreshCredits, signInWithGoogle } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [pair, setPair] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string>("");
  const [provider, setProvider] = useState<string>("");

  useEffect(() => {
    document.title = "AI-аналіз графіка | FX Signal Suite";
    const meta = document.querySelector('meta[name="description"]');
    const content =
      "Завантажте скріншот форекс-графіка і отримайте AI-аналіз: рівні, патерни, сигнал, SL/TP.";
    if (meta) meta.setAttribute("content", content);
    else {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = content;
      document.head.appendChild(m);
    }
  }, []);

  const handleFile = (file: File) => {
    if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/i)) {
      toast.error("Тільки PNG / JPEG / WEBP");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Файл завеликий", { description: "Максимум 6 MB" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(String(reader.result));
      setFileName(file.name);
      setAnalysis("");
    };
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const onPaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) {
          handleFile(f);
          break;
        }
      }
    }
  };

  useEffect(() => {
    window.addEventListener("paste", onPaste as any);
    return () => window.removeEventListener("paste", onPaste as any);
  }, []);

  const clearImage = () => {
    setImageDataUrl(null);
    setFileName("");
    setAnalysis("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const analyze = async () => {
    if (!user) {
      toast.error("Увійдіть, щоб скористатись AI-аналізом");
      return;
    }
    if (!imageDataUrl) {
      toast.error("Завантажте скріншот графіка");
      return;
    }
    if ((credits ?? 0) < CREDITS_COST) {
      toast.error("Недостатньо кредитів", {
        description: `Потрібно ${CREDITS_COST}. Докупіть кредити в профілі.`,
        action: { label: "Купити", onClick: () => navigate("/profile") },
      });
      return;
    }

    setLoading(true);
    setAnalysis("");
    try {
      const { data, error } = await supabase.functions.invoke("analyze-chart-image", {
        body: {
          image: imageDataUrl,
          pair: pair.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAnalysis(data.analysis);
      setProvider(data.provider || "");
      await refreshCredits();
      toast.success("Аналіз готовий", {
        description: `Списано ${CREDITS_COST} кредити. Залишок: ${data.credits_remaining}`,
      });
    } catch (e: any) {
      console.error(e);
      toast.error("Не вдалось проаналізувати", { description: e?.message ?? "Спробуйте ще раз" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="container mx-auto px-4 py-6 flex-1 w-full max-w-5xl">
        <Header
          mode="rule"
          onModeChange={() => {}}
          lastUpdate=""
          autoRefresh={false}
          nextRefreshIn={0}
        />

        <div className="space-y-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-2xl tracking-tight flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary" />
                AI-аналіз скріншоту графіка
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Завантажте скріншот з TradingView, MT4/5 або будь-якого терміналу — Gemini Vision
                прочитає рівні, патерни і запропонує торговий план. Вартість:{" "}
                <span className="text-foreground font-medium">{CREDITS_COST} кредити</span> за аналіз.
              </p>
            </div>
            {user && (
              <div className="text-sm flex items-center gap-2 px-3 py-2 border border-border rounded">
                <Coins className="w-4 h-4 text-primary" />
                Баланс: <span className="font-medium text-foreground">{credits ?? 0}</span>
              </div>
            )}
          </div>

          {!user && (
            <Card className="p-6 text-center space-y-3">
              <p className="text-muted-foreground">
                Увійдіть, щоб використати AI-аналіз графіків.
              </p>
              <Button onClick={signInWithGoogle}>Увійти з Google</Button>
            </Card>
          )}

          {user && (
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-5 space-y-4">
                <div
                  onDrop={onDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {imageDataUrl ? (
                    <div className="relative">
                      <img
                        src={imageDataUrl}
                        alt="Графік для AI-аналізу"
                        className="mx-auto max-h-72 rounded border border-border"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearImage();
                        }}
                        className="absolute top-2 right-2 bg-background/90 border border-border rounded p-1 hover:bg-background"
                        aria-label="Видалити"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <p className="text-xs text-muted-foreground mt-2 truncate">{fileName}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 py-4">
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                      <p className="text-sm">
                        Натисніть, перетягніть або вставте зображення з буфера (Ctrl+V)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PNG / JPEG / WEBP, до 6 MB
                      </p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />

                <div className="space-y-2">
                  <Label htmlFor="pair">Інструмент (необов'язково)</Label>
                  <Input
                    id="pair"
                    placeholder="EURUSD, BTCUSD, XAUUSD…"
                    value={pair}
                    onChange={(e) => setPair(e.target.value)}
                    maxLength={20}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Контекст / питання (необов'язково)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Напр.: тримаю шорт від 1.0850, чи варто закривати?"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={500}
                    rows={3}
                  />
                </div>

                <Button
                  onClick={analyze}
                  disabled={loading || !imageDataUrl}
                  className="w-full"
                  size="lg"
                >
                  {loading ? (
                    "Аналізую…"
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Проаналізувати ({CREDITS_COST} кредити)
                    </>
                  )}
                </Button>
              </Card>

              <Card className="p-5 min-h-[400px]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm uppercase tracking-wider text-muted-foreground">
                    Результат
                  </h3>
                  {provider && (
                    <span className="text-xs text-muted-foreground">{provider}</span>
                  )}
                </div>
                {!analysis && !loading && (
                  <div className="text-sm text-muted-foreground text-center py-16 space-y-2">
                    <ImageIcon className="w-10 h-10 mx-auto opacity-30" />
                    <p>Завантажте графік і натисніть «Проаналізувати»</p>
                  </div>
                )}
                {loading && (
                  <div className="text-sm text-muted-foreground text-center py-16">
                    Gemini читає графік… це займе 5–15 сек.
                  </div>
                )}
                {analysis && (
                  <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-foreground">
                    {analysis}
                  </pre>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ChartAnalysis;
