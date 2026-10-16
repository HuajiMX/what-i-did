import { useEffect, type ReactNode } from "react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** 移动端从底部升起；桌面端作为右侧抽屉 */
  variant?: "sheet" | "drawer";
}

/**
 * 移动端底部抽屉 / 桌面端侧抽屉。
 * 两种形态用同一份结构 + CSS 媒体查询实现，避免维护两套弹层逻辑。
 */
export default function Sheet({ open, onClose, title, children, variant = "drawer" }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // 弹层打开时锁定背景滚动，否则移动端会穿透滚动
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div
        className={`sheet sheet-${variant}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
