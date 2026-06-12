import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from "@/components/ui/sonner";

interface SubscriptionState {
  subscribed: boolean;
  tier: string | null;
  subscription_end: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  credits: number | null;
  refreshCredits: () => Promise<void>;
  subscription: SubscriptionState;
  refreshSubscription: () => Promise<void>;
  openCustomerPortal: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState>({
    subscribed: false,
    tier: null,
    subscription_end: null,
  });

  const refreshCredits = async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    const { data, error } = await supabase
      .from('user_credits')
      .select('credits_balance')
      .eq('user_id', u.id)
      .single();
    if (!error && data) setCredits(data.credits_balance);
  };

  const refreshSubscription = async () => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) {
      setSubscription({ subscribed: false, tier: null, subscription_end: null });
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (!error && data) {
        setSubscription({
          subscribed: !!data.subscribed,
          tier: data.tier ?? null,
          subscription_end: data.subscription_end ?? null,
        });
        await refreshCredits();
      }
    } catch (e) {
      console.error('refreshSubscription', e);
    }
  };

  const openCustomerPortal = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (e: any) {
      toast.error('Помилка', { description: e.message });
    }
  };

  useEffect(() => {
    const { data: { subscription: sub } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => {
            refreshCredits();
            refreshSubscription();
          }, 0);
        } else {
          setCredits(null);
          setSubscription({ subscribed: false, tier: null, subscription_end: null });
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => {
          refreshCredits();
          refreshSubscription();
        }, 0);
      }
    });

    // Refresh subscription every 60s while logged in
    const interval = setInterval(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) refreshSubscription();
      });
    }, 60000);

    return () => {
      sub.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl },
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error('Помилка входу', { description: error.message });
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast.success('Вихід виконано', { description: 'До зустрічі!' });
    } catch (error: any) {
      toast.error('Помилка виходу', { description: error.message });
    }
  };

  return (
    <AuthContext.Provider value={{
      user, session, signInWithGoogle, signOut,
      credits, refreshCredits,
      subscription, refreshSubscription, openCustomerPortal,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
