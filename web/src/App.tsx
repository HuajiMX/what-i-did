import { useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { BrandMark } from "./components/BrandMark";
import { Icon } from "./icons/Icon";
import { useAuth } from "./state/auth";
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
          <BrandMark size={16} />
        </span>
        <span className="brand-text">
          <span className="brand-title">我做了什么</span>
          <span className="faint tiny">生活记录与统计</span>
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
            <Icon name="target" size={18} />
            Tag 管理
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
  const location = window.location.pathname;
  const title = location.startsWith("/stats") ? "统计" : location.startsWith("/notes") ? "随手记" : "日历";
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  async function handleAuth() {
    if (!admin) {
      navigate("/login");
      return;
    }
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
      <span className="topbar-title">{title}</span>
      {ready ? (
        <button type="button" className="btn btn-sm btn-ghost" onClick={handleAuth} disabled={busy}>
          {admin ? "退出" : "登录"}
        </button>
      ) : (
        <span className="spinner" aria-label="正在检查登录状态" />
      )}
    </header>
  );
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
