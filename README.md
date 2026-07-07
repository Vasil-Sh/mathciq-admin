# MatchIQ Admin

Адміністративна панель для керування користувачами платформи [MatchIQ](https://matchiq.pro).

## 🛠 Стек

- **React 19** + **Vite 5**
- **TypeScript**
- **Tailwind CSS 3**
- **react-router-dom** v6
- **lucide-react** (іконки)
- **sonner** (тости)
- **react-day-picker** v9

## 🚀 Запуск локально

```bash
pnpm install
pnpm dev
```

Адмінка буде доступна на `http://localhost:5174`.

Потрібен запущений [MatchIQ Backend](https://github.com/Vasil-Sh/CS-backend) на `http://localhost:3001`.

Для підключення до продакшн-бекенду створи `.env`:

```
VITE_API_URL=https://cs-backend-production-f9e8.up.railway.app/api
```

## 📁 Структура

```
src/
├── App.tsx                    # Роутинг (login, dashboard, users)
├── contexts/
│   └── AuthContext.tsx        # Тільки admin-доступ
├── hooks/
│   └── useLogin.ts            # Логіка форми входу
├── lib/
│   ├── apiClient.ts           # JWT + auto-refresh
│   ├── authService.ts         # API для auth + CRUD користувачів
│   └── adminUtils.ts          # Утиліти (дати, ціни)
├── components/
│   ├── AdminLayout.tsx        # Сайдбар + Outlet
│   └── ui/                    # shadcn/ui компоненти
├── pages/
│   ├── LoginPage.tsx          # Форма входу (admin-only)
│   ├── Dashboard.tsx          # Дашборд (заглушка)
│   └── Admin.tsx              # Керування користувачами
└── types/
    └── index.ts               # Спільні типи
```

## 🔐 Доступ

Тільки для користувачів з роллю `admin`. При спробі входу звичайного користувача показується помилка «Доступ лише для адміністраторів».

## 🚢 Деплой

Проєкт готовий до деплою на Vercel (SPA з `vercel.json`) або Railway.

```bash
pnpm build   # → dist/
```

## 📄 Ліцензія

Private
