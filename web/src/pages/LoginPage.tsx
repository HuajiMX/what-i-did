import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../state/auth";
import { useToast } from "../state/toast";

export default function LoginPage() {
  const { admin, configured, login } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (admin) {
    return (
      <div className="narrow stack">
        <div className="page-head">
          <div>
            <h1 className="page-title">已登录</h1>
            <p className="page-sub">你现在拥有编辑权限。</p>
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => navigate("/calendar")}>
          回到日历
        </button>
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(password);
      notify("登录成功");
      navigate("/calendar");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "登录失败，请稍后重试";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">管理员登录</h1>
          <p className="page-sub">公开访问无需登录，登录后才能编辑记录。</p>
        </div>
      </div>

      {!configured ? (
        <div className="alert alert-danger">
          服务端还没有配置管理员密码。请在服务器上执行
          <code> npm run hash-password -- '你的密码' </code>
          并把输出写入 <code>.env</code> 的 <code>ADMIN_PASSWORD_HASH</code>。
        </div>
      ) : null}

      <form className="card stack" onSubmit={handleSubmit}>
        <div className="field">
          <label className="field-label" htmlFor="password">
            管理密码
          </label>
          <input
            id="password"
            className={`input ${error ? "input-error" : ""}`}
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        {error ? <div className="alert alert-danger">{error}</div> : null}

        <button type="submit" className="btn btn-primary" disabled={busy || !configured}>
          {busy ? "登录中…" : "登录"}
        </button>

        <p className="faint tiny">
          连续输错 5 次会被锁定 15 分钟。会话有效期由服务端 <code>SESSION_DAYS</code> 决定。
        </p>
      </form>
    </div>
  );
}
