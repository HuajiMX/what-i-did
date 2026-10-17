/**
 * 图标索引的纯逻辑层：把构建期生成的「官方 kebab 名 → 组件」配对表整理成可查找的索引。
 *
 * 为什么单独一层、而不是像上一版那样在运行时从模块命名空间里现场推导名字——
 * 上一版 lazy.ts 的推导把 `Object.entries(modules)` 的**每个值当成"模块"再遍历一遍**，
 * 而那个值其实是 `forwardRef` 组件对象（`{ $$typeof, render, displayName }`）。
 * 于是索引里凭空多出一个 key `render`，值是一个裸 render 函数，
 * 同时真正的 kebab 名一个都没写进去（`map.get("abacus")` 永远是 undefined）。
 *
 * 后果有两层，都是线上级故障：
 *  1. 选择器「全部图标」把 `render` 当成图标名渲染 → `setComponent(render)`，
 *     React 把函数参数当作函数式更新调用（`render(null)`）→ 解构 null 抛 TypeError
 *     → 整棵 React 树被卸载 → 白屏。
 *  2. 任何不在"常用 58 个"里的图标（例如 tag 存的 `abacus`）永远解析不出来，
 *     界面上只剩灰色占位方块。
 *
 * 所以图标名不再从 PascalCase 反推（实测 6238 个名字里有 104 个反推会错：
 * `crop-1-1` → `IconCrop11`、`a-b-2` → `IconAB2` 这类数字边界有歧义），
 * 配对表由 scripts/gen-icons.mjs 在构建期用官方清单算好，运行时只做归一化查找。
 */

import type { IconComponent } from "./common";

/** 归一化键：只保留字母数字并小写，所以 `device-gamepad-2` / `DeviceGamepad2` / `devicegamepad2` 等价 */
export function normalizeIconKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface IconIndex {
  /** 官方 kebab 名，顺序即图标库清单顺序，选择器按这个顺序展示 */
  readonly names: readonly string[];
  /** 归一化键 → 组件。只存组件引用，不含任何推导出来的键 */
  readonly byKey: ReadonlyMap<string, IconComponent>;
}

/**
 * 建立索引。输入必须是「名字与组件一一对应」的配对（生成物保证了这一点），
 * 归一化后重名的条目只保留第一个，避免选择器里出现重复格子。
 */
export function makeIconIndex(pairs: Iterable<readonly [string, IconComponent]>): IconIndex {
  const names: string[] = [];
  const byKey = new Map<string, IconComponent>();
  for (const [name, Component] of pairs) {
    const key = normalizeIconKey(name);
    if (byKey.has(key)) continue;
    names.push(name);
    byKey.set(key, Component);
  }
  return { names, byKey };
}

/** 按任意写法查图标；索引尚未加载时返回 null */
export function findIcon(index: IconIndex | null, name: string): IconComponent | null {
  if (!index) return null;
  return index.byKey.get(normalizeIconKey(name)) ?? null;
}
