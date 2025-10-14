import { useState, useEffect } from 'react';

interface MarketStatus {
  isOpen: boolean;
  nextOpenTime: Date | null;
  timeUntilOpen: string;
}

export const useMarketStatus = (): MarketStatus => {
  const [status, setStatus] = useState<MarketStatus>({
    isOpen: true,
    nextOpenTime: null,
    timeUntilOpen: '',
  });

  useEffect(() => {
    const checkMarketStatus = () => {
      const now = new Date();
      const utcDay = now.getUTCDay(); // 0=Sunday, 6=Saturday
      const utcHours = now.getUTCHours();

      // Forex market: Mon 00:00 UTC - Fri 23:59 UTC
      const isWeekend = utcDay === 0 || utcDay === 6;
      const isFridayClose = utcDay === 5 && utcHours >= 23;
      const isMarketOpen = !isWeekend && !isFridayClose;

      let nextOpen: Date | null = null;
      let timeUntil = '';

      if (!isMarketOpen) {
        // Calculate next Monday 00:00 UTC
        const daysUntilMonday = utcDay === 0 ? 1 : 8 - utcDay;
        nextOpen = new Date(now);
        nextOpen.setUTCDate(now.getUTCDate() + daysUntilMonday);
        nextOpen.setUTCHours(0, 0, 0, 0);

        const diff = nextOpen.getTime() - now.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) {
          timeUntil = `${days}д ${hours}г ${minutes}хв`;
        } else if (hours > 0) {
          timeUntil = `${hours}г ${minutes}хв`;
        } else {
          timeUntil = `${minutes}хв`;
        }
      }

      setStatus({
        isOpen: isMarketOpen,
        nextOpenTime: nextOpen,
        timeUntilOpen: timeUntil,
      });
    };

    checkMarketStatus();
    const interval = setInterval(checkMarketStatus, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  return status;
};
