const API_BASE = import.meta.env.VITE_MT5_API_URL || "https://84.247.166.52";

export interface TickData {
  symbol: string;
  time: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  spread: number;
}

export interface OHLCVBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tick_volume: number;
  spread: number;
  real_volume: number;
}

export interface AccountInfo {
  login: number;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  margin_level: number;
  profit: number;
  currency: string;
  leverage: number;
  server: string;
}

export const mt5Api = {
  async getTick(symbol: string): Promise<TickData> {
    try {
      console.log(`🔍 Fetching tick from MT5 for ${symbol}...`);
      const response = await fetch(`${API_BASE}/api/tick/${symbol}`, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
        },
      });
      if (!response.ok) throw new Error(`Failed to fetch tick for ${symbol}: ${response.status}`);
      const data = await response.json();
      console.log(`✅ MT5 tick received for ${symbol}:`, data);
      return data;
    } catch (error) {
      console.error(`❌ MT5 tick error for ${symbol}:`, error);
      throw error;
    }
  },

  async getOHLCV(symbol: string, timeframe: string, count = 100): Promise<OHLCVBar[]> {
    try {
      console.log(`🔍 Fetching OHLCV from MT5 for ${symbol} ${timeframe}...`);
      const response = await fetch(`${API_BASE}/api/ohlcv/${symbol}/${timeframe}?count=${count}`, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
        },
      });
      if (!response.ok) throw new Error(`Failed to fetch OHLCV for ${symbol}: ${response.status}`);
      const data = await response.json();
      console.log(`✅ MT5 OHLCV received for ${symbol}:`, data.length, 'bars');
      return data;
    } catch (error) {
      console.error(`❌ MT5 OHLCV error for ${symbol}:`, error);
      throw error;
    }
  },

  async getAccount(): Promise<AccountInfo> {
    try {
      console.log('🔍 Fetching account info from MT5...');
      const response = await fetch(`${API_BASE}/api/account`, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
        },
      });
      if (!response.ok) throw new Error(`Failed to fetch account info: ${response.status}`);
      const data = await response.json();
      console.log('✅ MT5 account info received:', data);
      return data;
    } catch (error) {
      console.error('❌ MT5 account error:', error);
      throw error;
    }
  },

  async getStatus() {
    try {
      console.log('🔍 Fetching status from MT5...');
      const response = await fetch(`${API_BASE}/api/status`, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
        },
      });
      if (!response.ok) throw new Error(`Failed to fetch status: ${response.status}`);
      const data = await response.json();
      console.log('✅ MT5 status received:', data);
      return data;
    } catch (error) {
      console.error('❌ MT5 status error:', error);
      throw error;
    }
  }
};
