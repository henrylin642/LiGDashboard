import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { DashboardDataProvider } from "./context/DashboardDataContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DashboardDataProvider>
      <App />
    </DashboardDataProvider>
  </StrictMode>
);
