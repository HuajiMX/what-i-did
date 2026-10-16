import { memo } from "react";
import { COMMON_ICONS, type IconComponent } from "./common";
import { useLazyIcon } from "./lazy";

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  stroke?: number;
  className?: string;
}

/**
 * 按图标名渲染图标的唯一入口。
 *
 * 三层策略（详见 web/src/icons/lazy.ts 的说明）：
 *  1. 命中常用集合 → 图标已随主包下载，同步渲染，无额外请求；
 *  2. 未命中 → 懒加载整库 chunk，加载中渲染一个同尺寸占位（保持布局稳定）；
 *  3. 名字不存在 → 渲染一个中性方块，不崩溃也不留空白。
 */
function IconImpl({ name, size = 18, color, stroke = 1.8, className }: IconProps) {
  const Resolved = useLazyIcon(name, COMMON_ICONS);
  if (!Resolved) {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{ display: "inline-block", width: size, height: size, borderRadius: 3, background: "var(--surface-3)" }}
      />
    );
  }
  return <Resolved size={size} color={color} stroke={stroke} className={className} aria-hidden="true" />;
}

export const Icon = memo(IconImpl);

/** 供选择器与表单预览使用：已知组件时直接渲染，不走解析 */
export function IconOf({
  Component,
  size = 18,
  color,
  stroke = 1.8,
}: {
  Component: IconComponent;
  size?: number;
  color?: string;
  stroke?: number;
}) {
  return <Component size={size} color={color} stroke={stroke} aria-hidden="true" />;
}

export { COMMON_ICONS };
