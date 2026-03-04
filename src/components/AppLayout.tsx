import { Outlet } from "react-router-dom";
import { LeftNav } from "./LeftNav";
import { useGlobalStream } from "../shared/hooks/useGlobalStream";
import { ToastProvider } from "./Toast";

export function AppLayout() {
  useGlobalStream();

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-[#F7F7F8]">
        <LeftNav />
        <main className="flex flex-1 flex-col overflow-hidden min-w-0">
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}
