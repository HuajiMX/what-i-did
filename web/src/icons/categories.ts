/** 图标分类。只覆盖常用集合，用于选择器的快速分组（全库 6238 个无法有意义地手工分类）。 */

export const ICON_CATEGORIES: { label: string; icons: string[] }[] = [
  {
    label: "运动健康",
    icons: [
      "run", "walk", "bike", "barbell", "yoga", "ball-basketball", "heartbeat", "heart",
      "stethoscope", "activity", "flame", "target",
    ],
  },
  {
    label: "学习工作",
    icons: [
      "code", "terminal-2", "bug", "brand-github", "book", "books", "notebook", "pencil",
      "school", "language", "briefcase", "building-bank", "chart-bar", "clock",
    ],
  },
  {
    label: "娱乐休闲",
    icons: [
      "music", "headphones", "microphone", "movie", "camera", "device-gamepad-2", "chess",
      "brush", "palette", "star", "trophy", "gift",
    ],
  },
  {
    label: "饮食日常",
    icons: ["coffee", "glass-full", "bottle", "tools-kitchen-2", "chef-hat", "shopping-cart"],
  },
  {
    label: "生活其他",
    icons: [
      "plant", "flower", "paw", "calendar", "map-pin", "compass", "plane", "beach",
      "sun", "moon", "users", "world", "device-desktop", "device-mobile",
    ],
  },
];

/** 选择器里"常用"标签页展示的顺序：按分类铺开 */
export const COMMON_ORDER: string[] = ICON_CATEGORIES.flatMap((group) => group.icons);
