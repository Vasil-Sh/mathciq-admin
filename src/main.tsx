import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./admin-design.css";
import "./lib/toastDefaults";
import "./styles/v3-shell.css";
import "./styles/v3-dashboard.css";
import "./styles/v3-login.css";
import "./styles/v3-users.css";
import "./styles/v3-bets.css";
import "./styles/v3-ads.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
