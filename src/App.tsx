import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/pages/LoginPage";
import Admin from "@/pages/Admin";

function ProtectedAdminRoute() {
  const { isAuthenticated, isVerifying } = useAuth();

  if (isVerifying) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-void">
        <div className="animate-spin w-8 h-8 border-2 border-lavender border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Admin />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/*" element={<ProtectedAdminRoute />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
        <Toaster
          position="top-center"
          theme="dark"
          toastOptions={{
            style: {
              background: "#050607",
              border: "1px solid #333333",
              color: "#ffffff",
              borderRadius: "16px",
              fontSize: "14px",
            },
          }}
          richColors
          closeButton
          duration={4000}
        />
      </Router>
    </AuthProvider>
  );
}
