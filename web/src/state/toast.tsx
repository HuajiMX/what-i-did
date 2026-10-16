import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
}

interface ToastValue {
  notify: (message: string) => void;
  notifyError: (message: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

/** 极简提示条。写操作的结果必须有可见反馈，否则用户不知道有没有保存成功。 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const push = useCallback((message: string, tone: Toast["tone"]) => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, message, tone }]);
    const timer = setTimeout(() => {
      setToasts((list) => list.filter((item) => item.id !== id));
      timers.current.delete(id);
    }, tone === "error" ? 5000 : 2600);
    timers.current.set(id, timer);
  }, []);

  const value = useMemo<ToastValue>(
    () => ({
      notify: (message: string) => push(message, "info"),
      notifyError: (message: string) => push(message, "error"),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone === "error" ? "toast-error" : ""}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast 必须在 ToastProvider 内使用");
  return value;
}
