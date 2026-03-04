import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ToastType = "success" | "error" | "info";

interface Toast {
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const showToast = useCallback((type: ToastType, message: string) => {
    // 清除之前的定时器
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    setToast({ type, message });

    // 3 秒后自动移除
    const id = setTimeout(() => {
      setToast(null);
    }, 3000);
    setTimeoutId(id);
  }, [timeoutId]);

  const success = useCallback((message: string) => showToast("success", message), [showToast]);
  const error = useCallback((message: string) => showToast("error", message), [showToast]);
  const info = useCallback((message: string) => showToast("info", message), [showToast]);

  return (
    <ToastContext.Provider value={{ success, error, info }}>
      {children}
      {createPortal(toast && <ToastItem toast={toast} />, document.body)}
    </ToastContext.Provider>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const [isVisible, setIsVisible] = useState(false);

  // 挂载后触发滑入动画
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const styles = {
    success: {
      border: "border-l-4 border-l-[#16A34A]",
      text: "text-[#15803D]",
    },
    error: {
      border: "border-l-4 border-l-[#DC2626]",
      text: "text-[#B91C1C]",
    },
    info: {
      border: "border-l-4 border-l-[#3B82F6]",
      text: "text-[#1D4ED8]",
    },
  };

  const style = styles[toast.type];

  return (
    <div
      className={`
        fixed bottom-6 right-6 z-[999]
        bg-white shadow-[0_8px_24px_rgba(0,0,0,0.1)] rounded-[10px] px-[18px] py-3
        text-[13px] font-medium pointer-events-none
        ${style.border} ${style.text}
        transition-all duration-[220ms] ease-out
        ${isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}
      `}
    >
      {toast.message}
    </div>
  );
}
