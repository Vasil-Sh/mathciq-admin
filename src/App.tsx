import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/pages/LoginPage";
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Admin = lazy(() => import("@/pages/Admin"));
const Bets = lazy(() => import("@/pages/Bets"));
const Banners = lazy(() => import("@/pages/Banners"));
import AdminLayout from "@/components/AdminLayout";

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
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Suspense fallback={<div className="page-container text-sm text-muted" role="status">Завантаження аналітики…</div>}><Dashboard /></Suspense>} />
        <Route path="/users" element={<Suspense fallback={<div className="page-container text-sm text-muted" role="status">Завантаження користувачів…</div>}><Admin /></Suspense>} />
        <Route path="/bets" element={<Suspense fallback={<div className="page-container text-sm text-muted" role="status">Завантаження ставок…</div>}><Bets /></Suspense>} />
        <Route path="/banners" element={<Suspense fallback={<div className="page-container text-sm text-muted" role="status">Завантаження банерів…</div>}><Banners /></Suspense>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
        <Toaster position="top-center" richColors closeButton duration={4000} />
      </Router>
    </AuthProvider>
  );
}
