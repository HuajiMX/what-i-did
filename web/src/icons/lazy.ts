/**
 * 【第二层】全库图标的按需加载。
 *
 * 关键约束（已实测）：不能对全部 6238 个图标逐个 `import()`——
 * 那会在构建产物里切出 6238 个碎片文件（总计 4.46 MB）。这里的做法相反：
 * 把整个图标库折叠成**一个**懒加载模块（`import("./generated/all-icons")`），
 * Rollup 会把它打成一个独立 chunk（约 2.4 MB / gzip 470 KB），只在真正需要时下载一次。
 *
 * 谁会用到它：管理员在图标选择器里选了常用图标之外的图标时（极低频），
 * 或历史数据里存在不在常用集合中的图标。公开页面的首屏永远不会加载这个 chunk。
 */

import { useEffect, useState } from "react";
import { commonIcon, type IconComponent } from "./common";
import { findIcon, makeIconIndex, type IconIndex } from "./index-build";

/** 折叠成一个懒加载模块：整个图标库只切出一个 chunk，而不是 6238 个 */
const loadAllIcons = () => import("./generated/all-icons");

let cache: IconIndex | null = null;
let pending: Promise<IconIndex> | null = null;

async function buildIndex(): Promise<IconIndex> {
  if (cache) return cache;
  if (!pending) {
    pending = loadAllIcons().then(({ ALL_ICONS }) => {
      cache = makeIconIndex(ALL_ICONS);
      return cache;
    });
  }
  return pending;
}

/** 已加载完成的全库索引；未加载时返回 null */
export function loadedIconIndex(): IconIndex | null {
  return cache;
}

/** 供图标选择器使用：确保整库索引已加载（选择器本身就是懒加载的，这里只是同一 chunk 内的等待） */
export const ensureIconIndex = buildIndex;

/**
 * 按需解析图标组件。
 * 先用常用集合命中（同步、零成本），未命中才触发整库 chunk 的懒加载。
 * 加载期间返回 null，调用方据此渲染占位，避免布局跳动。
 *
 * 注意 state 里存的是 `{ Component }` 包装对象，**不能**直接把组件塞进 setter：
 * useState 的 setter 会把函数参数当成函数式更新（`prev => next`）来调用它。
 * 普通函数组件、以及未用 forwardRef 包装的图标组件都是函数，
 * `setResolved(Component)` 会被 React 用 `null` 当 props 调用 → 解构 props 抛 TypeError
 * → 整棵 React 树被卸载 → 白屏（本次白屏的另一条路径）。
 */
export function useLazyIcon(name: string): IconComponent | null {
  const [resolved, setResolved] = useState<{ Component: IconComponent | null }>(() => ({
    Component: commonIcon(name),
  }));

  useEffect(() => {
    const common = commonIcon(name);
    if (common) {
      setResolved({ Component: common });
      return;
    }
    const index = loadedIconIndex();
    if (index) {
      setResolved({ Component: findIcon(index, name) });
      return;
    }
    let cancelled = false;
    void buildIndex().then((loaded) => {
      if (!cancelled) setResolved({ Component: findIcon(loaded, name) });
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  return resolved.Component;
}
