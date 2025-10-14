import { supabase } from "@/integrations/supabase/client";

export interface ForexPrice {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  spread: number;
  source: string;
  price_timestamp: string;
}

// Fetch latest price from database
export const getLatestPrice = async (symbol: string): Promise<ForexPrice | null> => {
  try {
    const { data, error } = await supabase
      .rpc('get_latest_forex_price', { p_symbol: symbol });

    if (error) {
      console.error(`[ForexDB] Error fetching ${symbol}:`, error);
      return null;
    }

    if (!data || data.length === 0) {
      console.log(`[ForexDB] No data found for ${symbol}`);
      return null;
    }

    return data[0] as ForexPrice;
  } catch (error) {
    console.error(`[ForexDB] Exception fetching ${symbol}:`, error);
    return null;
  }
};

// Fetch latest prices for multiple symbols
export const getLatestPrices = async (symbols: string[]): Promise<Record<string, ForexPrice>> => {
  const prices: Record<string, ForexPrice> = {};

  await Promise.all(
    symbols.map(async (symbol) => {
      const price = await getLatestPrice(symbol);
      if (price) {
        prices[symbol] = price;
      }
    })
  );

  return prices;
};

// Manually insert a price (for user edits)
export const insertPrice = async (
  symbol: string,
  price: number,
  bid?: number,
  ask?: number,
  volume?: number,
  spread?: number
): Promise<boolean> => {
  try {
    const { error } = await supabase.rpc('upsert_forex_price', {
      p_symbol: symbol,
      p_price: price,
      p_bid: bid ?? price * 0.9999,
      p_ask: ask ?? price * 1.0001,
      p_volume: volume ?? 0,
      p_spread: spread ?? price * 0.0002,
      p_source: 'manual'
    });

    if (error) {
      console.error(`[ForexDB] Error inserting ${symbol}:`, error);
      return false;
    }

    console.log(`[ForexDB] ✅ Inserted ${symbol}: ${price}`);
    return true;
  } catch (error) {
    console.error(`[ForexDB] Exception inserting ${symbol}:`, error);
    return false;
  }
};

// Trigger price update from Twelve Data API
export const updatePricesFromAPI = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('update-forex-prices');

    if (error) {
      console.error('[ForexDB] Error calling update function:', error);
      return { success: false, message: error.message };
    }

    console.log('[ForexDB] Update result:', data);
    return { 
      success: true, 
      message: `Оновлено ${data.updated} пар, помилок: ${data.failed}` 
    };
  } catch (error) {
    console.error('[ForexDB] Exception calling update:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};
