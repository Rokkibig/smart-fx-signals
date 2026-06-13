import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check, ArrowLeft, Crown, Zap, Sparkles, Coins } from 'lucide-react';
import { toast } from '@/components/ui/sonner';

const TIERS = [
  {
    name: 'Free',
    price: 0,
    tier: null,
    icon: Sparkles,
    features: [
      '3 безкоштовних AI-кредити',
      'Rule-Only сигнали',
      'Базові валютні пари',
      'Технічний аналіз (EMA, ADX, RSI)',
    ],
    cta: 'Поточний план',
    disabled: true,
  },
  {
    name: 'Pro',
    price: 9,
    tier: 'Pro',
    icon: Zap,
    popular: true,
    features: [
      '100 AI-аналізів на місяць',
      'Hybrid режим (Gemini AI)',
      'Усі валютні пари',
      'Trend + Range сигнали',
      'Підтримка email',
    ],
    cta: 'Обрати Pro',
  },
  {
    name: 'VIP',
    price: 29,
    tier: 'VIP',
    icon: Crown,
    features: [
      '500 AI-аналізів на місяць',
      'Hybrid режим (Gemini AI)',
      'Пріоритетне оновлення даних',
      'Розширена аналітика',
      'Пріоритетна підтримка',
    ],
    cta: 'Обрати VIP',
  },
];

const CREDIT_PACKS = [
  { key: 'small', credits: 50, price: 5, perCredit: '$0.10' },
  { key: 'medium', credits: 200, price: 15, perCredit: '$0.075', badge: 'Економія 25%' },
  { key: 'large', credits: 500, price: 30, perCredit: '$0.06', badge: 'Економія 40%' },
];

export default function Pricing() {
  const { user, signInWithGoogle, subscription } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);

  const handleSubscribe = async (tier: string) => {
    if (!user) {
      toast.error('Увійдіть, щоб оформити підписку');
      await signInWithGoogle();
      return;
    }

    setLoading(tier);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { tier },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (e: any) {
      toast.error('Помилка', { description: e.message });
    } finally {
      setLoading(null);
    }
  };

  const handleBuyCredits = async (packageKey: string) => {
    if (!user) {
      toast.error('Увійдіть, щоб придбати кредити');
      await signInWithGoogle();
      return;
    }
    setLoading(`pack-${packageKey}`);
    try {
      const { data, error } = await supabase.functions.invoke('purchase-credits', {
        body: { packageKey },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (e: any) {
      toast.error('Помилка', { description: e.message });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <Button variant="ghost" onClick={() => navigate('/')} className="mb-8">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад
        </Button>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Оберіть свій план</h1>
          <p className="text-muted-foreground">
            Розблокуйте AI-аналіз форекс ринку від Google Gemini
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {TIERS.map((t) => {
            const Icon = t.icon;
            const isCurrent = subscription?.tier === t.tier && subscription?.subscribed;
            return (
              <Card
                key={t.name}
                className={`p-8 relative ${t.popular ? 'border-primary border-2' : ''}`}
              >
                {t.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full">
                    Популярний
                  </div>
                )}
                <Icon className="w-10 h-10 mb-4 text-primary" />
                <h3 className="text-2xl font-bold mb-2">{t.name}</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold">${t.price}</span>
                  {t.price > 0 && <span className="text-muted-foreground">/місяць</span>}
                </div>

                <ul className="space-y-3 mb-8">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="w-full"
                  variant={t.popular ? 'default' : 'outline'}
                  disabled={t.disabled || isCurrent || loading === t.tier}
                  onClick={() => t.tier && handleSubscribe(t.tier)}
                >
                  {isCurrent ? 'Ваш план' : loading === t.tier ? 'Завантаження...' : t.cta}
                </Button>
              </Card>
            );
          })}
        </div>

        {/* Credit Packs */}
        <div className="mt-20">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-3">Докупити кредити</h2>
            <p className="text-muted-foreground">
              Одноразова покупка — кредити не згорають. Працює і без підписки.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {CREDIT_PACKS.map((pack) => (
              <Card key={pack.key} className="p-6 relative">
                {pack.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs px-3 py-1 rounded-full">
                    {pack.badge}
                  </div>
                )}
                <div className="flex items-center justify-between mb-4">
                  <Coins className="w-8 h-8 text-primary" />
                  <span className="text-xs text-muted-foreground">{pack.perCredit}/кредит</span>
                </div>
                <h3 className="text-xl font-bold mb-1">{pack.credits} кредитів</h3>
                <div className="mb-4">
                  <span className="text-3xl font-bold">${pack.price}</span>
                  <span className="text-muted-foreground text-sm ml-1">одноразово</span>
                </div>
                <p className="text-sm text-muted-foreground mb-6">
                  {pack.credits} AI-аналізів. Без терміну дії.
                </p>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={loading === `pack-${pack.key}`}
                  onClick={() => handleBuyCredits(pack.key)}
                >
                  {loading === `pack-${pack.key}` ? 'Завантаження...' : 'Придбати'}
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
