import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { endpoints, type SiteSettings } from "../api";

/**
 * 站点信息在启动时优先从服务端注入的 meta 读取，随后用 /api/site 刷新；
 * 管理页保存成功后把接口返回值直接写回来，不需要刷新页面。
 *
 * 不能只依赖 /api/site：请求返回前如果先用兜底值渲染，浏览器标签页会先显示
 * "我做了什么"，再跳到后台配置的标题——这正是首屏水合要解决的问题。
 *
 * 这里的兜底值必须与服务端 server/src/site.js 的 DEFAULT_SITE 一致：
 * 接口失败（例如后端还没起来）时至少别让品牌区变成空白。
 */
export const FALLBACK_SITE: SiteSettings = {
  title: "我做了什么",
  subtitle: "生活记录与统计",
  description: "个人生活记录与统计：日历活动、随手记与时段统计",
};

/**
 * 服务端 renderIndexHtml 会注入这三条 meta。三条必须同时存在才采用：
 * 缺一条说明不是服务端注入的首屏 HTML（例如 Vite 开发服务器），
 * 这时退回兜底值并等接口，而不是拼出一份半真半假的配置。
 */
function readServerSite(): SiteSettings | null {
  if (typeof document === "undefined") return null;
  const read = (name: string) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content");
  const title = read("site-title");
  const subtitle = read("site-subtitle");
  const description = read("site-description");
  if (typeof title !== "string" || typeof subtitle !== "string" || typeof description !== "string") return null;
  return { title, subtitle, description };
}

interface SiteValue {
  site: SiteSettings;
  /** 首屏站点信息是否可用（服务端注入或接口已返回） */
  ready: boolean;
  /** 保存成功后写入新值 */
  apply: (site: SiteSettings) => void;
  /** 重新从服务端读取 */
  reload: () => void;
}

const SiteContext = createContext<SiteValue | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const [initial] = useState<SiteSettings | null>(() => readServerSite());
  const [site, setSite] = useState<SiteSettings>(initial ?? FALLBACK_SITE);
  const [ready, setReady] = useState(initial !== null);
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
