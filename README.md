# Smart FX Signals

## Огляд
- Інтерактивна панель для моніторингу валютних пар Forex із режимами Rule та Hybrid.
- Інтеграція з Supabase: авторизація, менеджмент кредитів і Edge Functions для AI-аналізу.
- Вбудовані індикатори ринку, аналітика трендів і генерація торгових сигналів.

## Технології
- Vite + React 18 + TypeScript
- Tailwind CSS та shadcn/ui
- TanStack Query, Supabase JS SDK, React Hook Form
- Supabase Edge Functions (Deno)

## Вимоги
- Node.js 18+ та npm
- Опціонально Supabase CLI (для локального запуску функцій)
- Доступ до API ключів (див. нижче)

## Змінні середовища
Створіть `.env` у корені (або керуйте через систему змінних середовища/Vite env файли):
```ini
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-key>
VITE_MT5_API_URL=<optional-backend-url>
VITE_TWELVE_DATA_API_KEY=<optional-12data-key>
VITE_FMP_API_KEY=<optional-financialmodelingprep-key>
```

Для Supabase Edge Function `analyze-forex-ai` додайте секрети у Supabase Dashboard / CLI:
```ini
SUPABASE_URL=<project-url>
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
GOOGLE_API_KEY=<optional-gemini-key>
GROQ_API_KEY=<optional-groq-key>
```

## Локальний запуск
```sh
npm install
npm run dev
```
За замовчуванням сервер підніметься на `http://localhost:5173`. Vite прокидає змінні з файлів `*.env.local`.

## Supabase Edge Functions локально
```sh
supabase functions serve analyze-forex-ai --env-file supabase/.env
```
Переконайтеся, що у Supabase збережено таблиці `user_credits`, `ai_requests_log` та наявні політики RLS. Функція списує кредити перед AI-запитом і повертає їх у разі помилки.

## Структура
- `src/pages` — маршрути програми.
- `src/lib` — робота з базою валют, індикатори та API.
- `supabase/functions/analyze-forex-ai` — Edge Function для AI-аналізу.

## Перевірка якості
- `npm run lint` — ESLint
- `npm run build` — перевірка продакшин-збірки

## Подальші кроки
- Налаштувати крон для оновлення цін (`src/lib/forexDB.ts`).
- Додати ключі AI-провайдерів для режиму Hybrid.
- Перевірити UI в обох темах (light/dark) і адаптивність.
