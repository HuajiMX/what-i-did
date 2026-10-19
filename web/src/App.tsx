import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { BrandMark } from "./components/BrandMark";
import { Icon } from "./icons/Icon";
import { useAuth } from "./state/auth";
import { useSite } from "./state/site";
import { useToast } from "./state/toast";
import CalendarPage from "./pages/CalendarPage";
import LoginPage from "./pages/LoginPage";
import NotesPage from "./pages/NotesPage";
import StatsPage from "./pages/StatsPage";
import TagsPage from "./pages/TagsPage";

const NAV = [
  { to: "/calendar", label: "日历", icon: "calendar" },
  { to: "/stats", label: "统计", icon: "chart-bar" },
  { to: "/notes", label: "随手记", icon: "notebook" },
];

export default function App() {
  const { admin, ready } = useAuth();
  const { site } = useSite();
  const location = useLocation();

  // 站点 title / description 是可配置的：浏览器标签页与 meta 描述跟随当前页面变化。
  useEffect(() => {
    const page = pageLabel(location.pathname);
    document.title = site.title ? `${page} · ${site.title}` : page;

    const meta = document.querySelector('meta[name="description"]');
    if (!meta) return;
    if (site.description) meta.setAttribute("content", site.description);
    else meta.removeAttribute("content");
  }, [location.pathname, site.title, site.description]);

  return (
    <div className="app">
      <Sidebar admin={admin} />
      <TopBar admin={admin} ready={ready} />

      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/calendar" replace />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/calendar" replace />} />
        </Routes>
      </main>

      <BottomNav />
    </div>
  );
}

function Sidebar({ admin }: { admin: boolean }) {
  const { logout } = useAuth();
  const { site } = useSite();
  const { notify, notifyError } = useToast();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
      notify("已退出登录");
      navigate("/calendar");
    } catch {
      notifyError("退出失败，请重试");
    }
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <BrandMark />
        </span>
        <span className="brand-text">
          <span className="brand-title">{site.title}</span>
          {site.subtitle ? <span className="faint tiny">{site.subtitle}</span> : null}
        </span>
      </div>

      <nav className="nav" aria-label="主导航">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <Icon name={item.icon} size={18} />
            {item.label}
          </NavLink>
        ))}
        {admin ? (
          <NavLink to="/tags" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <Icon name="settings" size={18} />
            管理
          </NavLink>
        ) : null}
      </nav>

      <div className="sidebar-footer">
        {admin ? (
          <>
            <span className="faint tiny">已以管理员身份登录</span>
            <button type="button" className="btn btn-sm" onClick={handleLogout}>
              退出登录
            </button>
          </>
        ) : (
          <>
            <span className="faint tiny">公开浏览模式</span>
            <NavLink to="/login" className="btn btn-sm">
              管理员登录
            </NavLink>
          </>
        )}
      </div>
    </aside>
  );
}

function TopBar({ admin, ready }: { admin: boolean; ready: boolean }) {
  const { site } = useSite();
  const { logout } = useAuth();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await logout();
      notify("已退出登录");
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-title">{site.title}</span>
        {site.subtitle ? <span className="topbar-subtitle">{site.subtitle}</span> : null}
      </div>

      {/* 移动端没有侧栏，后台入口只能放在顶栏右侧。
          未登录时是"登录"，已登录时是通往 /tags 管理页的"管理"。 */}
      <div className="topbar-actions">
        {ready ? (
          <>
            <NavLink to={admin ? "/tags" : "/login"} className="btn btn-sm btn-ghost">
              <Icon name={admin ? "settings" : "login"} size={16} />
              {admin ? "管理" : "登录"}
            </NavLink>
            {admin ? (
              <button type="button" className="btn btn-sm btn-ghost" onClick={handleLogout} disabled={busy}>
                {busy ? "…" : "退出"}
              </button>
            ) : null}
          </>
        ) : (
          <span className="spinner" aria-label="正在检查登录状态" />
        )}
      </div>
    </header>
  );
}

/**
 * 页面名用于浏览器标签标题：保持"页面 · 站点"的层级，站点名可配置。
 * 与 server/src/site.js 的 pageLabel 保持一致：服务端负责首屏 title，前端负责 SPA 切换，
 * 两边不一致会导致刷新时标题跳一下。
 */
function pageLabel(pathname: string): string {
  if (pathname.startsWith("/stats")) return "统计";
  if (pathname.startsWith("/notes")) return "随手记";
  if (pathname.startsWith("/tags")) return "管理";
  if (pathname.startsWith("/login")) return "登录";
  return "日历";
}

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="主导航">
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => `bottom-nav-link ${isActive ? "active" : ""}`}>
          <Icon name={item.icon} size={20} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
