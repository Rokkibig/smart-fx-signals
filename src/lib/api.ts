const API_BASE = "http://84.247.166.52:8000";

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
    const response = await fetch(`${API_BASE}/api/tick/${symbol}`);
    if (!response.ok) throw new Error(`Failed to fetch tick for ${symbol}`);
    return response.json();
  },

  async getOHLCV(symbol: string, timeframe: string, count = 100): Promise<OHLCVBar[]> {
    const response = await fetch(`${API_BASE}/api/ohlcv/${symbol}/${timeframe}?count=${count}`);
    if (!response.ok) throw new Error(`Failed to fetch OHLCV for ${symbol}`);
    return response.json();
  },

  async getAccount(): Promise<AccountInfo> {
    const response = await fetch(`${API_BASE}/api/account`);
    if (!response.ok) throw new Error("Failed to fetch account info");
    return response.json();
  },

  async getStatus() {
    const response = await fetch(`${API_BASE}/api/status`);
    if (!response.ok) throw new Error("Failed to fetch status");
    return response.json();
  }
};
