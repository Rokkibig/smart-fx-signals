# Фаза 1 — покращення точності через дані

Три блоки, які працюють разом і дають найбільший приріст без зміни моделі.

## 1. Finnhub news sentiment
- Нова edge-функція `fetch-finnhub-news` (крон що 30 хв).
- Тягне forex/economy news + sentiment score по 7 парах.
- Пише в нову таблицю `market_news` (symbol, headline, url, sentiment, impact, published_at, source).
- `generate-daily-forecasts` та `revalidate-forecasts` дістають останні 12 год новин по парі і додають у контекст промпту.

**Потрібно від вас:** Finnhub API key (безкоштовно на finnhub.io/register).

## 2. News blackout window
- Нова таблиця `news_blackouts` заповнюється з `economic_events` (high-impact події) та `market_news` (impact=high).
- Правило: за 30 хв до і 30 хв після події по валюті — **блокуємо нові прогнози/сигнали** по парах з цією валютою.
- В `generate-daily-forecasts`, `revalidate-forecasts`, `analyze-forex-ai` додаємо перевірку: якщо blackout — статус `SKIPPED_NEWS` замість прогнозу.
- В UI: бейдж «⏸ Новини» на картці пари.

## 3. COT weekly ingest
- Edge-функція `fetch-cot-report` (крон щоп'ятниці 22:00 UTC).
- Тягне звіт з CFTC (публічний CSV, без ключа) — net positions по EUR, GBP, JPY, CHF, AUD, NZD, CAD.
- Таблиця `cot_positions` (currency, report_date, non_commercial_long, non_commercial_short, net_position, change_wow).
- Додається у контекст `generate-daily-forecasts` як «інституційне позиціонування».

## Технічні деталі

**Нові таблиці** (з GRANT + RLS authenticated read):
- `market_news` — sentiment feed
- `news_blackouts` — активні вікна тиші  
- `cot_positions` — тижневі COT дані

**Нові edge-функції:**
- `fetch-finnhub-news` — cron 30 хв
- `fetch-cot-report` — cron п'ятниця 22:00

**Модифіковані:**
- `generate-daily-forecasts` — +news context, +COT context, +blackout check
- `revalidate-forecasts` — +blackout check
- `analyze-forex-ai` — +blackout check
- `DailyForecasts.tsx` — бейджі новин та blackout статусу

**Секрети:** `FINNHUB_API_KEY` (запитаю після підтвердження).

## Порядок робіт
1. Міграція БД (3 таблиці)
2. Блок 3 (COT) — не потребує ключа, працює одразу
3. Блок 2 (blackout з existing economic_events) — теж без ключа
4. Блок 1 (Finnhub) — після додавання ключа

Підтвердіть — стартую з міграції та кроків 2-3, паралельно попрошу Finnhub ключ для кроку 1.