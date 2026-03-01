import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "./components/AppLayout";
import { BotManagementPage } from "./pages/BotManagement/BotManagementPage";
import { BotStatusPage } from "./pages/BotManagement/BotStatusPage";
import { PrivateChatPage } from "./pages/Chat/PrivateChatPage";
import { GroupChatPage } from "./pages/Chat/GroupChatPage";
import SettingsPage from "./pages/SettingsPage";
// import OpenClawInstallPage from './pages/OpenClawInstallPage';
import { startSidecar } from "./shared/tauri-bridge";
import { WizardPage } from "./pages/Onboarding/WizardPage";
import { isOnboardingComplete } from "./shared/store/wizard-store";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

// In production the sidecar binary must be started via Tauri invoke.
// In development the API is already running via `bun run dev:all`.
async function initSidecar() {
  if (import.meta.env.PROD) {
    try {
      await startSidecar();
    } catch (e) {
      console.warn("[sidecar] start_sidecar failed (may already be running):", e);
    }
  }
}

initSidecar();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            index
            element={
              isOnboardingComplete() ? (
                <Navigate to="/bots" replace />
              ) : (
                <Navigate to="/onboarding" replace />
              )
            }
          />
          {/* Wizard — outside AppLayout */}
          <Route path="onboarding" element={<WizardPage />} />

          {/* Main app */}
          <Route element={<AppLayout />}>
            <Route path="bots" element={<BotManagementPage />} />
            <Route path="bots/:id/status" element={<BotStatusPage />} />
            <Route path="chat/private" element={<PrivateChatPage />} />
            <Route path="chat/group" element={<GroupChatPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
