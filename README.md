# Цифровой обходной лист — HR система

Система автоматизации HR-процессов: обходные листы найма и увольнения,
реестр сотрудников, уведомления, интеграции с Gmail и Bitrix24.

## Технологии

- **Frontend:** React 19 + Vite 7 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Express 5 + Drizzle ORM + Zod validation
- **Database:** PostgreSQL (Neon в production, PGlite в development)
- **Photo storage:** Vercel Blob (production) / local disk (development)
- **Email:** Gmail via Google Apps Script
- **Deploy:** Vercel (serverless functions + static frontend)

## Быстрый старт (development)

### Требования

- Node.js 18+
- pnpm 9+ (`npm install -g pnpm`)

### Установка

```bash
# 1. Установить зависимости
pnpm install

# 2. Создать .env из шаблона
cp .env.example .env

# 3. Применить миграции (создаст PGlite БД в /home/z/my-project/db/)
DATABASE_URL="file:/home/z/my-project/db/routing-sheet-pglite" pnpm migrate

# 4. Заполнить демо-данными
DATABASE_URL="file:/home/z/my-project/db/routing-sheet-pglite" SESSION_SECRET=dev-secret pnpm seed

# 5. Запустить dev-серверы (API на :5000, Vite на :3000)
pnpm dev
```

Откройте http://localhost:3000

### Демо-аккаунты (пароль: `password123`)

| Роль | Email |
|---|---|
| Администратор | admin@demo.ru |
| Рекрутер | recruiter@demo.ru |
| HR | hr@demo.ru |
| Маркетинг | marketing@demo.ru |
| Главный врач | chief@demo.ru |
| Аккаунт-менеджер | account@demo.ru |

## Деплой на Vercel (production)

### Шаг 1: Создать GitHub репозиторий

```bash
# В директории проекта
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<ВАШ_ЮЗЕРНЕЙМ>/routing-sheet.git
git push -u origin main
```

### Шаг 2: Создать Neon Postgres базу

1. Зарегистрируйтесь на https://neon.tech (бесплатно)
2. Создайте новый проект
3. Скопируйте connection string (формат: `postgresql://user:pass@host/db?sslmode=require`)

### Шаг 3: Применить миграции к Neon

```bash
# Локально, с DATABASE_URL от Neon
DATABASE_URL="postgresql://..." SESSION_SECRET="любой-секрет" pnpm migrate

# Засеять демо-данными (опционально)
DATABASE_URL="postgresql://..." SESSION_SECRET="любой-секрет" pnpm seed
```

### Шаг 4: Импортировать проект в Vercel

1. Зайдите на https://vercel.com → "New Project"
2. Выберите ваш GitHub репозиторий
3. Vercel автоматически определит Vite-проект

### Шаг 5: Настроить Environment Variables в Vercel

В Vercel dashboard → Settings → Environment Variables добавьте:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://...` (от Neon) |
| `SESSION_SECRET` | случайная строка 32+ символа (`openssl rand -hex 32`) |
| `PUBLIC_BASE_URL` | `https://your-app.vercel.app` (после первого деплоя) |
| `BLOB_READ_WRITE_TOKEN` | от Vercel Blob (см. ниже) |
| `GAS_WEBHOOK_URL` | URL Google Apps Script (опционально) |

### Шаг 6: Создать Vercel Blob store (для фото)

1. В Vercel dashboard → Storage → Blob → Create store
2. Скопируйте `BLOB_READ_WRITE_TOKEN`
3. Добавьте в Environment Variables

### Шаг 7: Деплой

Нажмите "Deploy" в Vercel. Первый деплой займёт 2-3 минуты.

После деплоя обновите `PUBLIC_BASE_URL` на ваш Vercel URL и сделайте redeploy.

## Структура проекта

```
.
├── api/                          # Vercel serverless functions
│   ├── index.ts                  # /api → Express app
│   └── [...path].ts              # /api/* catch-all
├── artifacts/
│   ├── api-server/               # Express backend
│   │   └── src/
│   │       ├── routes/           # API endpoints
│   │       ├── lib/              # Business logic
│   │       └── services/         # Email, Bitrix24, etc.
│   └── routing-sheet/            # Vite + React frontend
│       └── src/
│           ├── pages/            # Route components
│           ├── components/       # Reusable UI
│           └── lib/              # Client utils
├── lib/
│   ├── db/                       # Drizzle ORM schema + connection
│   ├── api-zod/                  # Generated Zod schemas
│   └── api-client-react/         # Generated React Query hooks
├── vercel.json                   # Vercel config
├── .env.example                  # Env template
└── package.json                  # Workspace root
```

## Интеграции

### Email (Gmail via Google Apps Script)

1. Откройте https://script.google.com → New project
2. Вставьте код из `download/Code.gs`
3. Deploy → Web app → Access: Anyone
4. Скопируйте URL в `GAS_WEBHOOK_URL`

### Bitrix24

1. В Bitrix24 создайте входящий вебхук (REST API)
2. Скопируйте URL в `BITRIX24_REST_URL`

## Команды

```bash
pnpm dev              # Запуск dev-серверов
pnpm build            # Typecheck + build всех пакетов
pnpm build:vercel     # Build для Vercel (только frontend)
pnpm typecheck        # Проверка типов
pnpm migrate          # Применить миграции БД
pnpm seed             # Заполнить демо-данными
```

## Лицензия

MIT
