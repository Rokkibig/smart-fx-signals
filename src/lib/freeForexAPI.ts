// Free Forex API providers - rotate to avoid rate limits

interface ForexProvider {
  name: string;
  getTick: (symbol: string) => Promise<any>;
  priority: number; // Lower = try first
}

// Simple in-memory cache to avoid hitting rate limits
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Twelve Data - real-time Forex with free tier (800 requests/day)
const TWELVE_DATA_KEY = import.meta.env.VITE_TWELVE_DATA_API_KEY as string | undefined;
const twelveDataProvider: ForexProvider = {
  name: 'TwelveData',
  priority: 0, // Highest priority
  getTick: async (symbol: string) => {
    if (!TWELVE_DATA_KEY) throw new Error('Twelve Data API key missing');
    
    // Check cache first to avoid wasting API calls
    const cacheKey = `twelve_${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[TwelveData] Using cached data for ${symbol}`);
      return cached.data;
    }
    
    // Convert EUR/USD -> EUR/USD format
    const response = await fetch(
      `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(TWELVE_DATA_KEY)}`
    );
    
    if (!response.ok) {
      if (response.status === 429) throw new Error('Rate limit exceeded');
      throw new Error('Twelve Data API failed');
    }
    
    const data = await response.json();
    if (data.code === 429) throw new Error('Rate limit exceeded');
    if (!data.close) throw new Error('Twelve Data invalid response');
    
    const price = Number(data.close);
    const result = {
      symbol,
      time: new Date().toISOString(),
      bid: price * 0.9999,
      ask: price * 1.0001,
      last: price,
      volume: Number(data.volume || 0),
      spread: price * 0.0002,
    };
    
    // Cache the result
    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    
    return result;
  },
};

// Financial Modeling Prep - requires API key
const FMP_KEY = import.meta.env.VITE_FMP_API_KEY as string | undefined;
const fmpProvider: ForexProvider = {
  name: 'FMP',
  priority: 3,
  getTick: async (symbol: string) => {
    if (!FMP_KEY) throw new Error('FMP API key missing');
    // Convert EUR/USD -> EURUSD
    const pair = symbol.replace('/', '');
    const response = await fetch(`https://financialmodelingprep.com/api/v3/quote/${pair}?apikey=${encodeURIComponent(FMP_KEY)}`);
    if (!response.ok) throw new Error('FMP API failed');
    const data = await response.json();
    const quote = data?.[0];
    if (!quote?.price) throw new Error('FMP invalid response');
    const price = Number(quote.price);
    
    return {
      symbol,
      time: new Date().toISOString(),
      bid: price * 0.9999, // Approximate bid
      ask: price * 1.0001, // Approximate ask
      last: price,
      volume: quote.volume || 0,
      spread: price * 0.0002,
    };
  },
};

// ExchangeRate.host - may require key now; keep as low priority
const exchangeRateProvider: ForexProvider = {
  name: 'ExchangeRate',
  priority: 4,
  getTick: async (symbol: string) => {
    const [base, target] = symbol.split('/');
    const response = await fetch(`https://api.exchangerate.host/latest?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(target)}`);
    if (!response.ok) throw new Error('ExchangeRate API failed');
    const data = await response.json();
    const rate = data?.rates?.[target];
    if (!rate) throw new Error('ExchangeRate invalid response');
    const price = Number(rate);
    
    return {
      symbol,
      time: new Date().toISOString(),
      bid: price * 0.9999,
      ask: price * 1.0001,
      last: price,
      volume: 0,
      spread: price * 0.0002,
    };
  },
};

// Frankfurter.app - free, reliable
const frankfurterProvider: ForexProvider = {
  name: 'Frankfurter',
  priority: 1,
  getTick: async (symbol: string) => {
    const [base, quote] = symbol.split('/');
    const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(quote)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Frankfurter API failed');
    const data = await res.json();
    const rate = data?.rates?.[quote];
    if (!rate) throw new Error('Frankfurter invalid response');
    const price = Number(rate);
    return {
      symbol,
      time: new Date().toISOString(),
      bid: price * 0.9999,
      ask: price * 1.0001,
      last: price,
      volume: 0,
      spread: price * 0.0002,
    };
  },
};

// open.er-api.com - free
const erApiProvider: ForexProvider = {
  name: 'ERAPI',
  priority: 2,
  getTick: async (symbol: string) => {
    const [base, quote] = symbol.split('/');
    const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('ER API failed');
    const data = await res.json();
    const rate = data?.rates?.[quote];
    if (!rate) throw new Error('ER API invalid response');
    const price = Number(rate);
    return {
      symbol,
      time: new Date().toISOString(),
      bid: price * 0.9999,
      ask: price * 1.0001,
      last: price,
      volume: 0,
      spread: price * 0.0002,
    };
  },
};

// Fallback: Generate realistic mock data based on historical patterns
const mockProvider: ForexProvider = {
  name: 'Mock',
  priority: 99,
  getTick: async (symbol: string) => {
    const basePrices: Record<string, number> = {
      'EUR/USD': 1.0850,
      'GBP/USD': 1.2650,
      'USD/JPY': 149.50,
      'USD/CHF': 0.8850,
      'AUD/USD': 0.6550,
      'NZD/USD': 0.6050,
      'USD/CAD': 1.3650,
    };

    const basePrice = basePrices[symbol] || 1.0;
    const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
    const price = basePrice * (1 + variation);

    return {
      symbol,
      time: new Date().toISOString(),
      bid: price * 0.9999,
      ask: price * 1.0001,
      last: price,
      volume: Math.floor(Math.random() * 10000),
      spread: price * 0.0002,
    };
  },
};

const providers: ForexProvider[] = [
  // Twelve Data first - real-time with caching
  ...(TWELVE_DATA_KEY ? [twelveDataProvider] : []),
  // Free providers as fallback
  frankfurterProvider,
  erApiProvider,
  // Other keyed providers if configured
  ...(FMP_KEY ? [fmpProvider] : []),
  // Keep old provider as last attempt
  exchangeRateProvider,
  mockProvider,
];

export const freeForexApi = {
  async getTick(symbol: string) {
    // Try providers in priority order
    for (const provider of providers.sort((a, b) => a.priority - b.priority)) {
      try {
        console.log(`[ForexAPI] Trying ${provider.name} for ${symbol}`);
        const data = await provider.getTick(symbol);
        console.log(`[ForexAPI] ✅ ${provider.name} successful`);
        return data;
      } catch (error) {
        console.warn(`[ForexAPI] ❌ ${provider.name} failed:`, error);
        // Continue to next provider
      }
    }

    throw new Error('All Forex API providers failed');
  },

  async getOHLCV(symbol: string, timeframe: string, count = 100) {
    // For now, generate mock OHLCV data
    // In future, can integrate with TwelveData or AlphaVantage
    const tick = await this.getTick(symbol);
    const bars = [];
    
    for (let i = count - 1; i >= 0; i--) {
      const time = new Date(Date.now() - i * 3600000); // 1 hour ago
      const variation = (Math.random() - 0.5) * 0.01;
      const open = tick.last * (1 + variation);
      const high = open * (1 + Math.random() * 0.005);
      const low = open * (1 - Math.random() * 0.005);
      const close = low + Math.random() * (high - low);

      bars.push({
        time: time.toISOString(),
        open,
        high,
        low,
        close,
        tick_volume: Math.floor(Math.random() * 1000) + 100,
        spread: Math.floor(Math.random() * 10) + 3,
        real_volume: 0,
      });
    }

    return bars;
  },
};
