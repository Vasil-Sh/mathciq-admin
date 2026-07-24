# MatchIQ Admin

Адміністративна панель для керування користувачами платформи [MatchIQ](https://matchiq.pro).

## 🛠 Стек

- **React 19** + **Vite 5**
- **TypeScript**
- **Tailwind CSS 3**
- **shadcn/ui** (Dialog, Select, Label, Button)
- **@radix-ui/react-dialog / react-select / react-label / react-slot**
- **react-router-dom** v6
- **lucide-react** (іконки)
- **sonner** (тости)
- **react-day-picker** v9
- **date-fns**
- **class-variance-authority + clsx + tailwind-merge**

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
├── App.tsx                    # Роутинг (/login, /dashboard, /users)
├── contexts/
│   └── AuthContext.tsx        # JWT-автентифікація (тільки admin)
├── hooks/
│   └── useLogin.ts            # Логіка форми входу
├── lib/
│   ├── apiClient.ts           # JWT + auto-refresh
│   ├── authService.ts         # API: auth + CRUD користувачів
│   └── adminStatsApi.ts       # API: /admin/stats (дашборд)
├── components/
│   ├── AdminLayout.tsx        # Сайдбар + Outlet
│   └── ui/                    # shadcn/ui (dialog, select, label, button)
├── pages/
│   ├── LoginPage.tsx          # Форма входу (admin-only)
│   ├── Dashboard.tsx          # Аналітичний дашборд (KPI, таблиці, лідерборди)
│   └── Admin.tsx              # CRUD користувачів (модалки, фільтри, пагінація)
└── types/
    └── index.ts               # Спільні типи
```

## 🎯 Функціонал

### 📊 Дашборд (`/dashboard`)

- **5 KPI-карток**: MRR, Активні користувачі, Нові (за місяць), Адміни, Неактивні
- **Revenue & Users** — помісячна таблиця з %-змінами, ARPU (Average Revenue Per User)
- **Plan Distribution** — розподіл тарифів з візуальними прогрес-барами
- **Conversion Rate** — active/inactive/admin співвідношення
- **Top Revenue Users** — лідерборд по доходу
- **Recent Registrations** — останні реєстрації
- **Фільтр по місяцях** — вибір окремого місяця з накопичувальними тоталами

### 👥 Користувачі (`/users`)

- **CRUD користувачів** — додавання, редагування, видалення
- **Модальні вікна** — Add User (з генерацією пароля), Edit User, Delete Confirm, Reset Password
- **Фільтри** — пошук, статус (active/inactive/admin), роль
- **Date picker** — вибір start/end дати для фільтрації
- **Сортування + пагінація**

## 🔐 Доступ

Тільки для користувачів з роллю `admin`. При спробі входу звичайного користувача показується помилка «Доступ лише для адміністраторів».

## 🚢 Деплой

Проєкт готовий до деплою на Vercel (SPA з `vercel.json`) або Railway.

```bash
pnpm build   # → dist/
```

## 📄 Ліцензія

Private
