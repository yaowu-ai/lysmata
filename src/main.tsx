import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "./components/AppLayout";
import { BotManagementPage } from "./pages/BotManagement/BotManagementPage";
import { BotStatusPage } from "./pages/BotManagement/BotStatusPage";
import { PrivateChatPage } from "./pages/Chat/PrivateChatPage";
import { GroupChatPage } from "./pages/Chat/GroupChatPage";
import SettingsPage from "./pages/SettingsPage";
import { ArtifactDemoPage } from "./pages/ArtifactDemoPage";
// import OpenClawInstallPage from './pages/OpenClawInstallPage';
import { startSidecar } from "./shared/tauri-bridge";
import { OnboardingEntryPage } from "./pages/OnboardingV2/OnboardingEntryPage";
import { OnboardingV2Page } from "./pages/OnboardingV2/OnboardingV2Page";
import { StartupGuard } from "./components/StartupGuard";
import "./index.css";

// Add devtools toggle support
if (import.meta.env.PROD) {
  document.addEventListener("keydown", (e) => {
    if (e.key === "F12" || (e.ctrlKey && e.shiftKey && e.key === "I")) {
      e.preventDefault();
      // @ts-expect-error - Tauri API injected at runtime
      if (window.__TAURI__) {
        // @ts-expect-error - Tauri API injected at runtime
        window.__TAURI__.event.emit("toggle-devtools");
      }
    }
  });
}

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
      console.log("[sidecar] Starting sidecar...");
      await startSidecar();
      console.log("[sidecar] Sidecar started successfully");
      
      // Wait for sidecar to be ready (max 10 seconds)
      const maxRetries = 20;
      const retryDelay = 500;
      for (let i = 0; i < maxRetries; i++) {
        try {
          const response = await fetch("http://127.0.0.1:2620/health");
          if (response.ok) {
            console.log(`[sidecar] Health check passed after ${i * retryDelay}ms`);
            return true;
          }
        } catch (e) {
          // Retry
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
      console.error("[sidecar] Health check timeout after 10 seconds");
      return false;
    } catch (e) {
      console.error("[sidecar] Failed to start sidecar:", e);
      return false;
    }
  }
  return true; // In dev mode, assume sidecar is already running
}

// Wait for sidecar to be ready before rendering
initSidecar().then((ready) => {
  if (!ready && import.meta.env.PROD) {
    console.error("[sidecar] Failed to initialize, but rendering anyway");
  }
  
  ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route index element={<StartupGuard />} />
          {/* Wizard — outside AppLayout */}
          <Route path="onboarding" element={<OnboardingEntryPage />} />
          <Route path="onboarding/:step" element={<OnboardingV2Page />} />

          {/* Main app */}
          <Route element={<AppLayout />}>
            <Route path="bots" element={<BotManagementPage />} />
            <Route path="bots/:id/status" element={<BotStatusPage />} />
            <Route path="chat/private" element={<PrivateChatPage />} />
            <Route path="chat/group" element={<GroupChatPage />} />
            <Route path="artifact" element={<ArtifactDemoPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
  );
});
