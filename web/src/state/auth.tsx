import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { endpoints } from "../api";

interface AuthValue {
  /** 是否为管理员（决定是否渲染编辑入口） */
  admin: boolean;
  /** 服务端是否配置了管理员密码 */
  configured: boolean;
  /** 首次判定登录态是否完成。未完成时不渲染"登录"按钮，避免闪现 */
  ready: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * 登录态只从服务端读取（/api/me），前端不缓存任何凭证。
 * 唯一的真相是 HttpOnly cookie，它无法被 JS 读取，因此也没有"本地伪造"这条路。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    endpoints
      .me()
      .then((result) => {
        if (cancelled) return;
        setAdmin(result.admin);
        setConfigured(result.configured);
      })
      .catch(() => {
        // 判定失败按未登录处理：安全默认值
        if (!cancelled) setAdmin(false);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (password: string) => {
    await endpoints.login(password);
    setAdmin(true);
  }, []);

  const logout = useCallback(async () => {
    await endpoints.logout();
    setAdmin(false);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ admin, configured, ready, login, logout }),
    [admin, configured, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return value;
}
