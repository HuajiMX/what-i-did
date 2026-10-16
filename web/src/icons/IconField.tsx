import { Suspense, lazy } from "react";
import { COMMON_ICONS } from "./common";
import { Icon, IconOf } from "./Icon";
const IconPicker = lazy(() => import("./IconPicker"));

interface Props {
  icon: string;
  color: string;
  onIconChange: (name: string) => void;
  onColorChange: (color: string) => void;
  colors: string[];
}

/**
 * 图标 + 颜色的选择控件。
 * 选择器本身按需加载：它含 6238 个图标定义（约 1.3 MB），
 * 未点开之前一个字节都不会下载，公开访客更不会遇到它。
 */
export default function IconField({ icon, color, onIconChange, onColorChange, colors }: Props) {
  return (
    <div className="stack-sm">
      <span className="field-label">图标与颜色</span>
      <div className="row-wrap">
        <span className="icon-preview" style={{ color }}>
          <Icon name={icon} size={22} />
        </span>
        <div className="color-dots" role="radiogroup" aria-label="颜色">
          {colors.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={item === color}
              aria-label={`颜色 ${item}`}
              className={`color-dot ${item === color ? "color-dot-active" : ""}`}
              style={{ background: item }}
              onClick={() => onColorChange(item)}
            />
          ))}
        </div>
      </div>

      <Suspense fallback={<div className="picker-loading">正在准备图标选择器…</div>}>
        <IconPicker value={icon} onChange={onIconChange} />
      </Suspense>

      <p className="faint tiny">
        当前图标名：<code>{icon}</code>
        {icon in COMMON_ICONS ? "（常用，随页面直接加载）" : "（按需加载，首次显示会多一次请求）"}
      </p>
    </div>
  );
}

/** 供其他地方复用的纯展示图标 */
export { IconOf };
