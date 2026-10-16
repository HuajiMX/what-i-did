/**
 * 【第二层】全库图标的按需加载。
 *
 * 关键约束（上一轮已实测）：不能对全部 6238 个图标逐个 `import()`——
 * 那会在构建产物里切出 6238 个碎片文件（总计 4.46 MB）。这里的做法相反：
 * 把整个图标目录**折叠成一个懒加载模块**（`import.meta.glob` 不带 eager），
 * Rollup 会把它打成一个独立 chunk（约 1.3 MB），只在真正需要时下载一次。
 *
 * 谁会用到它：管理员在图标选择器里选了常用图标之外的图标时（极低频），
 * 或历史数据里存在不在常用集合中的图标。公开页面的首屏永远不会加载这个 chunk。
 */

import { useEffect, useState } from "react";
import type { IconComponent } from "./common";

type IconModule = Record<string, unknown>;

/** 折叠成一个懒加载模块：整个目录只切出一个 chunk，而不是 6238 个 */
const loadAllIcons = () => import("./generated/all-icons");

let cache: Map<string, IconComponent> | null = null;
let pending: Promise<Map<string, IconComponent>> | null = null;

/**
 * 把文件名（例如 `IconDeviceGamepad2.mjs`）映射到图标名（`device-gamepad-2`）。
 * 不能直接反转 kebab→Pascal，因为数字边界有歧义（"gamepad-2" 对应 "Gamepad2"）。
 * 因此统一"只保留字母数字并小写"作为匹配键，两侧同规则归一化后比较。
 */
const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

async function buildIndex(): Promise<Map<string, IconComponent>> {
  if (cache) return cache;
  if (!pending) {
    pending = loadAllIcons().then((modules) => {
      const map = new Map<string, IconComponent>();
      for (const [filePath, module] of Object.entries(modules as unknown as Record<string, IconModule>)) {
        const file = filePath.split("/").pop() ?? "";
        const base = file.replace(/\.(mjs|js|tsx?|jsx)$/, "");
        // 同时注册 PascalCase 组件名与归一化键，避免任何边界情况漏匹配
        for (const [exportName, component] of Object.entries(module)) {
          if (typeof component !== "function" && typeof component !== "object") continue;
          map.set(normalizeKey(exportName), component as IconComponent);
          if (exportName.startsWith("Icon")) {
            map.set(normalizeKey(exportName.slice(4)), component as IconComponent);
          }
        }
        map.set(normalizeKey(base), (module as IconModule)[base] as IconComponent);
      }
      cache = map;
      return map;
    });
  }
  return pending;
}

/** 已加载完成的全库索引；未加载时返回 null */
export function loadedIconIndex(): Map<string, IconComponent> | null {
  return cache;
}

/**
 * 按需解析图标组件。
 * 先用常用集合命中（同步、零成本），未命中才触发整库 chunk 的懒加载。
 * 加载期间返回 null，调用方据此渲染占位，避免布局跳动。
 */
export function useLazyIcon(name: string, common: Record<string, IconComponent>): IconComponent | null {
  const [resolved, setResolved] = useState<IconComponent | null>(() => common[name] ?? null);

  useEffect(() => {
    if (common[name]) {
      setResolved(common[name]!);
      return;
    }
    const index = loadedIconIndex();
    if (index) {
      setResolved(index.get(normalizeKey(name)) ?? null);
      return;
    }
    let cancelled = false;
    void buildIndex().then((map) => {
      if (!cancelled) setResolved(map.get(normalizeKey(name)) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [name, common]);

  return resolved;
}

/** 供图标选择器使用：确保整库索引已加载（选择器本身就是懒加载的，这里只是同一 chunk 内的等待） */
export const ensureIconIndex = buildIndex;
