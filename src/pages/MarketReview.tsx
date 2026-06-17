import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Newspaper } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";

interface Review {
  id: string;
  session: string;
  market_context: string;
  ai_provider: string | null;
  created_at: string;
}

const sessionLabels: Record<string, string> = {
  asia: "Азійська сесія",
  london: "Лондонська сесія",
  ny: "Нью-Йоркська сесія",
  overnight: "Нічний огляд",
};

const MarketReview = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      let q = supabase
        .from("daily_market_reviews")
        .select("id, session, market_context, ai_provider, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (filter !== "all") q = q.eq("session", filter);
      const { data } = await q;
      setReviews((data ?? []) as Review[]);
      setLoading(false);
    })();
  }, [filter]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Newspaper className="w-6 h-6" />
            Огляд ринку
          </h1>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {["all", "asia", "london", "ny", "overnight"].map((s) => (
            <Button
              key={s}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(s)}
            >
              {s === "all" ? "Всі" : sessionLabels[s]}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Завантаження…</div>
      ) : reviews.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Поки немає оглядів. Перший з'явиться після наступного автоматичного запуску.
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => {
            const d = new Date(r.created_at);
            return (
              <Card key={r.id} className="p-5">
                <div className="flex items-center justify-between mb-3 text-sm">
                  <div className="font-medium">{sessionLabels[r.session] ?? r.session}</div>
                  <div className="text-muted-foreground">
                    {d.toLocaleString("uk-UA")} • {r.ai_provider}
                  </div>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{r.market_context}</ReactMarkdown>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MarketReview;
