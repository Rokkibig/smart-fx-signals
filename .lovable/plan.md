# Фаза 2 — прогнози тільки на реальних даних (без фантазій AI)

Ціль: прибрати «вигадування» з боку моделі. Прогноз повинен бути **виведений зі статистики схожих історичних ситуацій**, а не з довільного тексту AI. AI залишається тільки як формулювач пояснення на основі цифр, які ми йому дали, — без права змінювати напрям, ціни чи ймовірність.

---

## 1. Патерн-снапшот кожного стану ринку

Нова таблиця `market_snapshots` — фіксує «портрет» ринку на момент часу для кожної пари.

Поля (числові, дискретизовані у бакети, щоб можна було шукати схожі стани):
- `symbol`, `snapshot_at`
- Тренд по TF: `trend_d1`, `trend_h4`, `trend_h1`, `trend_m15` — `up/down/flat` (EMA20 vs EMA50 vs EMA200)
- Сила тренду: `adx_h1_bucket`, `adx_h4_bucket` — бакети (`<15`, `15-20`, `20-25`, `25-35`, `>35`)
- RSI: `rsi_h1_bucket`, `rsi_h4_bucket` — (`<30`, `30-45`, `45-55`, `55-70`, `>70`)
- Відстань ціни від EMA200 H1 в ATR: `dist_ema200_atr_bucket`
- Позиція в денному діапазоні: `range_pos_bucket` (0-20/20-40/40-60/60-80/80-100 %)
- Сесія: `asia/london/ny/overlap`
- День тижня
- COT-нахил: `cot_bias` (`long/short/neutral`) — з `cot_positions`
- News-фон: `news_sentiment_bucket` (`neg/neu/pos`) за 12 год

Знімки робимо кожні 15 хв для 7 пар (є вже cron точок оновлення індикаторів).

## 2. Історичний backtest — «що було через 24 год»

Нова edge-функція `backfill-snapshots` (одноразово + інкремент щогодини):
- Для кожного бару H1 з нашої історії будує `market_snapshot` (по даних, доступних на той момент).
- Дивиться реальний рух через 24 год (по H1 OHLC): напрям (`up/down/flat`), max favorable excursion, max adverse excursion, чи торкнулось ±0.5/1.0/1.5 ATR.
- Пише в `snapshot_outcomes` (snapshot_id, move_24h_pips, direction_24h, mfe_atr, mae_atr, hit_1atr_up, hit_1atr_down).

Це — наша «пам'ять». Що більше історії маємо (D1 з 2025, H1 з вересня 2025), то ширша статистика. Одразу видно скільки реально є прикладів на кожен патерн.

## 3. Прогноз як SQL-запит, а не як AI-твір

Нова функція `generate-statistical-forecast` (замінює логіку в `generate-daily-forecasts`):

Крок A — беремо поточний `market_snapshot` для пари.
Крок B — SQL шукає всі історичні снапшоти з тим самим (або близьким) набором бакетів → їхні `snapshot_outcomes`.
Крок C — рахуємо:
- `n_matches` — скільки схожих випадків знайдено
- `p_up`, `p_down`, `p_flat` — фактичні частоти
- `avg_move_pips`, `median_move_pips`
- Типовий MFE / MAE → з них будуємо TP і SL (реальні, з історії, а не з голови)

Крок D — правила публікації:
- `n_matches < 30` → статус `INSUFFICIENT_HISTORY`, прогноз не публікується.
- max(p_up, p_down) `< 55%` → статус `NO_EDGE`.
- Інакше — direction = сторона з більшою частотою, probability = ця частота, TP/SL = медіана MFE/MAE в пунктах від поточної ціни.

Крок E (опційно) — AI отримує вже готові цифри і пише **тільки текст пояснення** («знайдено N схожих випадків з 2025, у M% ціна пішла вгору, типовий рух X пунктів»). AI **не має права** змінювати direction/probability/TP/SL.

## 4. Прозорість у UI

На картці прогнозу показуємо:
- «Базується на N історичних випадках»
- «Історична частота up/down: X% / Y%»
- «Типовий рух: медіана Z пунктів, MAE W пунктів»
- Джерела: technical / news / cot — бейджі які реально вплинули

Прогнози зі статусом `INSUFFICIENT_HISTORY` та `NO_EDGE` показуємо окремим списком «Немає статистичної переваги» — щоб було чесно.

## 5. Оцінка залишається як є

`evaluate-daily-forecasts` вже працює по OHLC — нічого не змінюємо. Метрики `forecast_stats` тепер відображатимуть якість **статистичної моделі**, а не AI-творчості.

---

## Технічні деталі

**Нові таблиці:**
- `market_snapshots` (symbol + бакети + snapshot_at, unique(symbol, snapshot_at))
- `snapshot_outcomes` (snapshot_id FK, horizon_hours, direction_24h, move_pips, mfe_atr, mae_atr)

**Нові edge-функції:**
- `build-snapshot` — робить снапшот з `forex_features` + news + cot (виклик з крону кожні 15 хв)
- `backfill-snapshots` — прогін по історії forex_ohlcv, разова + інкрементальна
- `generate-statistical-forecast` — SQL-пошук схожих + правила публікації (замінює AI-only логіку)

**Модифікуємо:**
- `generate-daily-forecasts` → викликає `generate-statistical-forecast`; AI тільки формулює reasoning з даних
- `DailyForecasts.tsx` → нові поля (n_matches, p_up, п_down, історична медіана)

**Крон:**
- `build-snapshot` — кожні 15 хв
- `backfill-snapshots` — інкремент щогодини (нові бари H1)

## Порядок робіт

1. Міграція БД: `market_snapshots`, `snapshot_outcomes` + GRANT + RLS.
2. `build-snapshot` + cron.
3. `backfill-snapshots` — прогін всієї нашої історії (D1 з 2025, H1 з вересня).
4. `generate-statistical-forecast` + інтеграція в `generate-daily-forecasts`.
5. UI — показ n_matches, історичних частот, статусів `INSUFFICIENT_HISTORY` / `NO_EDGE`.

Після цього кожен прогноз можна буде перевірити: «звідки взялись ці цифри» → відповідь: «з N реальних історичних випадків, ось запит». Ніяких фантазій.
