import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { endpoints, type SiteSettings } from "../api";

/**
 * 站点信息只在启动时读一次；管理页保存成功后把接口返回值直接写回来，
 * 侧栏、移动端顶栏与 document.title 会跟着更新，不需要刷新页面。
 *
 * 这里的兜底值必须与服务端 server/src/site.js 的 DEFAULT_SITE 一致：
 * 接口失败（例如后端还没起来）时至少别让品牌区变成空白。
 */
export const FALLBACK_SITE: SiteSettings = {
  title: "我做了什么",
  subtitle: "生活记录与统计",
  description: "个人生活记录与统计：日历活动、随手记与时段统计",
};

interface SiteValue {
  site: SiteSettings;
  /** 首次请求是否完成 */
  ready: boolean;
  /** 保存成功后写入新值 */
  apply: (site: SiteSettings) => void;
  /** 重新从服务端读取 */
  reload: () => void;
}

const SiteContext = createContext<SiteValue | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<SiteSettings>(FALLBACK_SITE);
  const [ready, setReady] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    endpoints
      .site()
      .then((result) => {
        if (!cancelled) setSite(result.site);
      })
      .catch(() => {
        // 读不到时保留兜底值；公开展示不该因为一次配置请求失败而不可用
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const apply = useCallback((next: SiteSettings) => setSite(next), []);
  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const value = useMemo<SiteValue>(() => ({ site, ready, apply, reload }), [site, ready, apply, reload]);

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteValue {
  const value = useContext(SiteContext);
  if (!value) throw new Error("useSite 必须在 SiteProvider 内使用");
  return value;
}
