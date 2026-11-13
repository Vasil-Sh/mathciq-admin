import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/pages/LoginPage";
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Admin = lazy(() => import("@/pages/Admin"));
const Bets = lazy(() => import("@/pages/Bets"));
const AuditLog = lazy(() => import("@/pages/AuditLog"));
const Banners = lazy(() => import("@/pages/Banners"));
const Settings = lazy(() => import("@/pages/Settings"));
import AdminLayout from "@/components/AdminLayout";
import ComingSoon from "@/pages/ComingSoon";
import NotFound from "@/pages/NotFound";

/** Where to go after signing in: the page the session ended on, otherwise the dashboard. */
function takeReturnTo() {
  const to = sessionStorage.getItem("returnTo");
  sessionStorage.removeItem("returnTo");
  sessionStorage.removeItem("sessionEnded");
  return to && to.startsWith("/") && !to.startsWith("/login") ? to : "/dashboard";
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isVerifying } = useAuth();
  if (isVerifying) return <div className="flex items-center justify-center min-h-screen bg-canvas"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to={takeReturnTo()} replace /> : <LoginPage />} />
      <Route element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Suspense fallback={<div className="page-container text-sm text-muted" role="status">Завантаження аналітики…</div>}><Dashboard /></Suspense>} />
        <Route path="/users" element={<Suspense fallback={<div className="page-container text-sm text-muted" role="status">Завантаження користувачів…</div>}><Admin /></Suspense>} />
        <Route path="/bets" element={<Suspense fallback={<div className="page-container text-sm text-muted" role="status">Завантаження ставок…</div>}><Bets /></Suspense>} />
        <Route path="/banners" element={<Suspense fallback={<div className="page-container text-sm text-muted" role="status">Завантаження банерів…</div>}><Banners /></Suspense>} />
        <Route path="/audit" element={<Suspense fallback={<div role="status">Завантаження журналу…</div>}><AuditLog /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<div role="status">Завантаження налаштувань…</div>}><Settings /></Suspense>} />
        <Route path="/payments" element={<ComingSoon title="Оплати" subtitle="Ручний облік оплат, повернення й промокоди." planned={["Список оплат із фільтрами Записано / Скасовано / Повернено", "Деталі оплати, чек для користувача, повернення грошей", "Промокоди: знижка, термін дії, ліміт використань"]} />} />
        <Route path="/matches" element={<ComingSoon title="Матчі" subtitle="Дані з tips.gg і HLTV, ручні правки й довідник команд." planned={["Матчі на сьогодні та найближчі, ручні правки часу й рахунку", "Стан парсерів tips.gg і HLTV з повторним запуском", "Матчі, додані користувачами вручну, — об’єднання з офіційними", "Довідник команд і псевдонімів"]} />} />
        <Route path="/support" element={<ComingSoon title="Підтримка" subtitle="Звернення з форми «Проблема чи побажання» й модерація Telegram-груп." planned={["Звернення: нові, в роботі, вирішені; відповідь у застосунок і Telegram", "Шаблони відповідей", "Модерація Telegram-груп, які додали користувачі Pro"]} />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
        <Toaster position="bottom-right" theme="dark" richColors closeButton duration={4000} visibleToasts={3} offset={24} style={{ width: 380 }} />
      </Router>
    </AuthProvider>
  );
}
