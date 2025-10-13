// Rate limiter для двох AI API (Google Gemini і Groq)
interface APIConfig {
  name: string;
  key: string;
  requestsPerMinute: number;
  requestsPerDay: number;
}

interface RequestLog {
  timestamp: number;
  api: string;
}

class AIRateLimiter {
  private apis: APIConfig[];
  private requestLog: RequestLog[] = [];
  private currentApiIndex = 0;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Безкоштовні ліміти для Google Gemini Flash: 15 RPM, 1500 RPD
    // Groq free tier: 30 RPM, 14400 RPD
    this.apis = [
      {
        name: "gemini",
        key: "AIzaSyCWJIwrLKCSTAbTuUwf38xBvpag9k1kHJo",
        requestsPerMinute: 10, // консервативно, щоб не перевищити
        requestsPerDay: 1000,
      },
      {
        name: "groq",
        key: "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",
        requestsPerMinute: 20,
        requestsPerDay: 10000,
      },
    ];
  }

  // Перевірка чи можемо зробити запит
  canMakeRequest(apiName: string): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Видалити старі записи
    this.requestLog = this.requestLog.filter((log) => log.timestamp > oneDayAgo);

    const api = this.apis.find((a) => a.name === apiName);
    if (!api) return false;

    const recentRequests = this.requestLog.filter(
      (log) => log.api === apiName && log.timestamp > oneMinuteAgo
    );

    const dailyRequests = this.requestLog.filter(
      (log) => log.api === apiName && log.timestamp > oneDayAgo
    );

    return (
      recentRequests.length < api.requestsPerMinute &&
      dailyRequests.length < api.requestsPerDay
    );
  }

  // Отримати доступний API
  getAvailableAPI(): APIConfig | null {
    // Спробувати поточний API
    if (this.canMakeRequest(this.apis[this.currentApiIndex].name)) {
      return this.apis[this.currentApiIndex];
    }

    // Спробувати інший API
    const nextIndex = (this.currentApiIndex + 1) % this.apis.length;
    if (this.canMakeRequest(this.apis[nextIndex].name)) {
      this.currentApiIndex = nextIndex;
      return this.apis[nextIndex];
    }

    return null; // Обидва API вичерпані
  }

  // Записати запит
  logRequest(apiName: string) {
    this.requestLog.push({
      timestamp: Date.now(),
      api: apiName,
    });
  }

  // Кешування
  getCached(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  setCache(key: string, data: any) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  // Статистика
  getStats() {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    return this.apis.map((api) => {
      const recentRequests = this.requestLog.filter(
        (log) => log.api === api.name && log.timestamp > oneMinuteAgo
      ).length;

      const dailyRequests = this.requestLog.filter(
        (log) => log.api === api.name && log.timestamp > oneDayAgo
      ).length;

      return {
        name: api.name,
        requestsLastMinute: recentRequests,
        requestsToday: dailyRequests,
        remainingPerMinute: api.requestsPerMinute - recentRequests,
        remainingPerDay: api.requestsPerDay - dailyRequests,
      };
    });
  }
}

// Singleton instance
export const aiRateLimiter = new AIRateLimiter();
