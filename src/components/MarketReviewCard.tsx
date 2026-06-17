import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Newspaper, ArrowRight, Clock } from "lucide-react";
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

export const MarketReviewCard = () => {
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("daily_market_reviews")
        .select("id, session, market_context, ai_provider, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setReview(data as Review | null);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <Card className="p-6 mb-6">
        <div className="text-sm text-muted-foreground">Завантаження огляду…</div>
      </Card>
    );
  }

  if (!review) {
    return (
      <Card className="p-6 mb-6 border-dashed">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Newspaper className="w-4 h-4" />
          <span>Огляд сесії з'явиться після першого автоматичного запуску (кожні 4 год).</span>
        </div>
      </Card>
    );
  }

  const created = new Date(review.created_at);
  const minutes = Math.floor((Date.now() - created.getTime()) / 60000);
  const ago =
    minutes < 60 ? `${minutes} хв тому` : `${Math.floor(minutes / 60)} год тому`;

  return (
    <Card className="p-6 mb-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">
              {sessionLabels[review.session] ?? "Огляд ринку"}
            </h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <Clock className="w-3 h-3" />
              <span>{ago}</span>
              {review.ai_provider && (
                <>
                  <span>•</span>
                  <span>{review.ai_provider}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/market-review")}>
          Історія <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none line-clamp-[18]">
        <ReactMarkdown>{review.market_context}</ReactMarkdown>
      </div>
    </Card>
  );
};
