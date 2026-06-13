import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Coins, TrendingUp, LogOut, ArrowLeft, Crown, Settings } from 'lucide-react';
import { toast } from '@/components/ui/sonner';

export default function Profile() {
  const { user, signOut, credits, refreshCredits, subscription, refreshSubscription, openCustomerPortal } = useAuth();
  const [requestsLog, setRequestsLog] = useState<any[]>([]);
  const [isLoadingRequest, setIsLoadingRequest] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    loadRequestsLog();

    if (searchParams.get('success') === 'true') {
      toast.success('Підписку оформлено!', { description: 'Дякуємо за підтримку 🎉' });
      setTimeout(() => refreshSubscription(), 2000);
    }
    if (searchParams.get('credits_purchased') === 'true') {
      toast.success('Кредити додано!', { description: 'Дякуємо за покупку 🎉' });
      // Webhook updates async; refresh a few times
      setTimeout(() => refreshCredits(), 1500);
      setTimeout(() => refreshCredits(), 5000);
    }
  }, [user, navigate, searchParams]);

  const loadRequestsLog = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('ai_requests_log')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      setRequestsLog(data);
    }
  };

  const handlePremiumRequest = async () => {
    if (!credits || credits < 1) {
      toast.error('Недостатньо кредитів', {
        description: 'Будь ласка, придбайте більше кредитів для використання AI аналізу.',
      });
      return;
    }

    setIsLoadingRequest(true);

    try {
      // Example: analyze current EUR/USD
      const mockData = {
        pair: 'EUR/USD',
        price: 1.0850,
        trend: '↗',
        strength: 65,
        trend_matrix: { D1: '↗', H4: '→', H1: '↗', M15: '↗' },
      };

      const { data, error } = await supabase.functions.invoke('analyze-forex-ai', {
        body: { pairData: mockData },
      });

      if (error) throw error;

      toast.success('AI Аналіз готовий', {
        description: `Кредитів залишилось: ${data.credits_remaining}`,
      });

      await refreshCredits();
      await loadRequestsLog();

      // Show analysis (you can create a modal for this)
      console.log('AI Analysis:', data.analysis);

    } catch (error: any) {
      console.error('Premium request error:', error);
      toast.error('Помилка', {
        description: error.message || 'Не вдалося виконати запит',
      });
    } finally {
      setIsLoadingRequest(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Вийти
          </Button>
        </div>

        <h1 className="text-3xl font-bold mb-8">Особистий кабінет</h1>

        {/* User Info & Credits */}
        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                {user.user_metadata.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt="Avatar"
                    className="w-16 h-16 rounded-full"
                  />
                ) : (
                  <span className="text-2xl">👤</span>
                )}
              </div>
              <div>
                <h3 className="font-semibold">{user.user_metadata.full_name || user.email}</h3>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Ваші кредити</p>
                <p className="text-3xl font-bold">{credits ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  1 кредит = 1 AI аналіз
                </p>
              </div>
              <Coins className="w-12 h-12 text-primary/20" />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-4"
              onClick={() => navigate('/pricing')}
            >
              <Coins className="w-4 h-4 mr-2" />
              Докупити кредити
            </Button>
          </Card>
        </div>

        {/* Subscription Card */}
        <Card className="p-6 mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Crown className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">
                  {subscription.subscribed ? `Тариф ${subscription.tier}` : 'Безкоштовний план'}
                </h3>
                {subscription.subscribed && subscription.subscription_end && (
                  <p className="text-sm text-muted-foreground">
                    Активний до {new Date(subscription.subscription_end).toLocaleDateString('uk-UA')}
                  </p>
                )}
                {!subscription.subscribed && (
                  <p className="text-sm text-muted-foreground">
                    Отримайте Hybrid AI режим від $9/місяць
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {subscription.subscribed ? (
                <Button variant="outline" onClick={openCustomerPortal}>
                  <Settings className="w-4 h-4 mr-2" />
                  Керувати підпискою
                </Button>
              ) : (
                <Button onClick={() => navigate('/pricing')}>
                  <Crown className="w-4 h-4 mr-2" />
                  Обрати тариф
                </Button>
              )}
            </div>
          </div>
        </Card>


        {/* Premium AI Button */}
        <Card className="p-6 mb-8 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold mb-2">🤖 Premium AI Аналіз</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Отримайте детальний аналіз від Claude Sonnet 4.5 з конкретними рекомендаціями
              </p>
              <p className="text-xs text-muted-foreground">
                Вартість: 1 кредит (~$0.001 для вас, вартість для інших $0.10)
              </p>
            </div>
            <Button
              onClick={handlePremiumRequest}
              disabled={isLoadingRequest || !credits || credits < 1}
              className="min-w-[200px]"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              {isLoadingRequest ? 'Аналізую...' : 'Оновити зараз (1 кредит)'}
            </Button>
          </div>
        </Card>

        {/* Requests History */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Історія AI запитів</h3>
          {requestsLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ще немає запитів</p>
          ) : (
            <div className="space-y-3">
              {requestsLog.map((log) => (
                <div
                  key={log.id}
                  className="border-b pb-3 last:border-0"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{log.request_type}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(log.created_at).toLocaleString('uk-UA')}
                      </p>
                    </div>
                    <span className="text-xs bg-primary/10 px-2 py-1 rounded">
                      -{log.credits_used} кредит
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
