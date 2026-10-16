import { useEffect, useMemo, useState } from "react";
import { COMMON_ICONS, type IconComponent } from "./common";
import { COMMON_ORDER, ICON_CATEGORIES } from "./categories";
import { ensureIconIndex, loadedIconIndex } from "./lazy";
import { IconOf } from "./Icon";

/** 每次渲染的图标数量上限。全库 6238 个一次性挂到 DOM 会明显卡顿，多出来的靠"加载更多"分批渲染。 */
const PAGE = 240;

interface Props {
  value: string;
  onChange: (name: string) => void;
}

/** 常见但 Tabler 没提供的搜索别名 → 归一到图标名，方便中文/口语检索 */
const SEARCH_ALIASES: Record<string, string[]> = {
  跑: ["run", "walk"], 跑步: ["run"], 走: ["walk"], 骑行: ["bike"], 骑车: ["bike"], 健身: ["barbell", "activity"],
  瑜伽: ["yoga"], 球: ["ball-basketball"], 篮球: ["ball-basketball"], 心: ["heart", "heartbeat"], 健康: ["heartbeat", "stethoscope"],
  代码: ["code", "terminal-2", "bug"], 编程: ["code", "terminal-2", "bug"], 读书: ["book", "books"], 书: ["book", "books"],
  写: ["pencil", "notebook"], 学习: ["school", "language", "book"], 工作: ["briefcase", "building-bank"],
  音乐: ["music", "headphones"], 电影: ["movie"], 游戏: ["device-gamepad-2"], 拍照: ["camera"], 摄影: ["camera"],
  画画: ["brush", "palette"], 吃: ["coffee", "tools-kitchen-2", "chef-hat"], 喝: ["coffee", "glass-full", "bottle"],
  做饭: ["chef-hat", "tools-kitchen-2"], 购物: ["shopping-cart"], 旅行: ["plane", "map-pin", "compass"],
  花: ["flower", "plant"], 植物: ["plant", "flower"], 宠物: ["paw"], 猫: ["paw"], 狗: ["paw"],
  天气: ["sun", "moon"], 早: ["sun"], 晚: ["moon"], 团队: ["users"], 世界: ["world"],
  电脑: ["device-desktop"], 手机: ["device-mobile"], 奖: ["trophy", "star"], 礼物: ["gift"],
  目标: ["target"], 时间: ["clock"], 日历: ["calendar"], 图表: ["chart-bar"], 统计: ["chart-bar"],
};

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * 图标选择器。整个组件被 IconPickerButton 懒加载，
 * 因此它引用的整库索引与 6238 个图标定义都不会进入公开页面的主包。
 */
export default function IconPicker({ value, onChange }: Props) {
  const [tab, setTab] = useState<"common" | "all">("common");
  const [query, setQuery] = useState("");
  const [allIcons, setAllIcons] = useState<Map<string, IconComponent> | null>(() => loadedIconIndex());
  const [visible, setVisible] = useState(PAGE);

  // 切到"全部"时才去加载整库索引（约 1.3 MB，会被浏览器缓存）
  useEffect(() => {
    if (tab !== "all" || allIcons) return;
    let cancelled = false;
    void ensureIconIndex().then((map) => {
      if (!cancelled) setAllIcons(map);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, allIcons]);

  useEffect(() => setVisible(PAGE), [tab, query]);

  const { names, isSearching } = useMemo(() => {
    const q = query.trim();
    if (!q) {
      return { names: tab === "common" ? COMMON_ORDER.filter((n) => n in COMMON_ICONS) : [...(allIcons?.keys() ?? [])], isSearching: false };
    }
    const lower = q.toLowerCase();
    const key = normalizeKey(q);
    const aliasHits = new Set<string>();
    for (const [alias, iconNames] of Object.entries(SEARCH_ALIASES)) {
      if (alias.includes(q) || q.includes(alias)) for (const n of iconNames) aliasHits.add(n);
    }
    const pool = tab === "common" ? COMMON_ORDER : [...(allIcons?.keys() ?? [])];
    const matched = pool.filter((name) => {
      const normalized = normalizeKey(name);
      return aliasHits.has(name) || (key.length > 0 && normalized.includes(key)) || name.toLowerCase().includes(lower);
    });
    return { names: matched, isSearching: true };
  }, [query, tab, allIcons]);

  return (
    <div className="icon-picker">
      <div className="row-wrap picker-tabs">
        <button type="button" className={`chip ${tab === "common" ? "chip-active" : ""}`} onClick={() => setTab("common")}>
          常用（{COMMON_ORDER.length}）
        </button>
        <button type="button" className={`chip ${tab === "all" ? "chip-active" : ""}`} onClick={() => setTab("all")}>
          全部图标{allIcons ? `（${allIcons.size}）` : ""}
        </button>
        {tab === "all" && !allIcons ? <span className="spinner" aria-label="正在加载图标库" /> : null}
      </div>

      <input
        className="input"
        type="search"
        placeholder="搜索：run / bike / 跑步 / 代码 …"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="搜索图标"
      />

      {tab === "common" && !isSearching ? (
        <div className="stack-sm">
          {ICON_CATEGORIES.map((group) => (
            <div key={group.label}>
              <div className="faint tiny picker-group-label">{group.label}</div>
              <div className="icon-grid">
                {group.icons
                  .filter((name) => name in COMMON_ICONS)
                  .map((name) => (
                    <IconCell key={name} name={name} selected={name === value} onSelect={onChange} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="icon-grid">
            {names.slice(0, visible).map((name) => (
              <IconCell key={name} name={name} selected={name === value} onSelect={onChange} />
            ))}
          </div>
          {names.length === 0 ? (
            <p className="empty">
              {tab === "all" && !allIcons ? "正在加载图标库…" : "没有匹配的图标，试试英文名（如 run、book）"}
            </p>
          ) : null}
          {names.length > visible ? (
            <button type="button" className="btn btn-sm" onClick={() => setVisible((v) => v + PAGE)}>
              加载更多（还有 {names.length - visible} 个）
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function IconCell({ name, selected, onSelect }: { name: string; selected: boolean; onSelect: (name: string) => void }) {
  return (
    <button
      type="button"
      className={`icon-cell ${selected ? "icon-cell-active" : ""}`}
      title={name}
      aria-label={name}
      aria-pressed={selected}
      onClick={() => onSelect(name)}
    >
      <AnyIcon name={name} />
    </button>
  );
}

/**
 * 单元格里的图标渲染。
 * 常用图标走 IconOf（同步）；其余走 Icon 的懒加载解析（未就绪时显示占位）。
 * 这里刻意不直接用 COMMON_ICONS[name]，因为选择器在"全部"标签下会渲染整库图标。
 */
function AnyIcon({ name }: { name: string }) {
  const direct = COMMON_ICONS[name];
  if (direct) return <IconOf Component={direct} size={22} />;
  return <LazyCell name={name} />;
}

function LazyCell({ name }: { name: string }) {
  const [Component, setComponent] = useState<IconComponent | null>(null);
  useEffect(() => {
    let cancelled = false;
    void ensureIconIndex().then((map) => {
      if (!cancelled) setComponent(map.get(normalizeKey(name)) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);
  if (!Component) {
    return <span className="icon-cell-placeholder" aria-hidden="true" />;
  }
  return <IconOf Component={Component} size={22} />;
}
