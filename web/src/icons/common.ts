/**
 * 【第一层】打进公开主包的常用图标。
 *
 * 这里必须是**显式具名 import**。绝不能写成
 *   import * as Icons from "@tabler/icons-react"
 *   const Icon = Icons["Icon" + name]
 * 那种写法会把全部 6238 个图标打进公开包（约 5 MB），而且不会报错、只是变慢。
 * 工程上有两道防线：本文件的显式 import 写法，加上 scripts/check-bundle-size.mjs 的体积断言。
 *
 * 体积实测（见 docs/probe-node24.md）：每个图标约 450 B，本文件约 50 个 → 主包图标成本可忽略。
 */

import {
  IconActivity,
  IconBallBasketball,
  IconBarbell,
  IconBeach,
  IconBike,
  IconBook,
  IconBooks,
  IconBottle,
  IconBrandGithub,
  IconBriefcase,
  IconBrush,
  IconBug,
  IconBuildingBank,
  IconCalendar,
  IconCamera,
  IconChartBar,
  IconChess,
  IconChefHat,
  IconClock,
  IconCode,
  IconCoffee,
  IconCompass,
  IconDeviceDesktop,
  IconDeviceGamepad2,
  IconDeviceMobile,
  IconFlame,
  IconFlower,
  IconGift,
  IconGlassFull,
  IconHeadphones,
  IconHeart,
  IconHeartbeat,
  IconLanguage,
  IconLogin,
  IconMapPin,
  IconMicrophone,
  IconMoon,
  IconMovie,
  IconMusic,
  IconNotebook,
  IconPalette,
  IconPaw,
  IconPencil,
  IconPlane,
  IconPlant,
  IconRun,
  IconSchool,
  IconSettings,
  IconShoppingCart,
  IconStar,
  IconStethoscope,
  IconSun,
  IconTarget,
  IconTerminal2,
  IconToolsKitchen2,
  IconTrophy,
  IconUsers,
  IconWalk,
  IconWorld,
  IconYoga,
} from "@tabler/icons-react";
import type { FC } from "react";

/** 图标组件的统一签名（Tabler 的 Icon 组件 props 很宽，这里只约束我们需要用到的部分） */
export type IconComponent = FC<{ size?: number | string; stroke?: number; color?: string; className?: string }>;

export const COMMON_ICONS: Record<string, IconComponent> = {
  run: IconRun,
  walk: IconWalk,
  bike: IconBike,
  barbell: IconBarbell,
  yoga: IconYoga,
  "ball-basketball": IconBallBasketball,
  heartbeat: IconHeartbeat,
  heart: IconHeart,
  stethoscope: IconStethoscope,
  code: IconCode,
  "terminal-2": IconTerminal2,
  bug: IconBug,
  "brand-github": IconBrandGithub,
  book: IconBook,
  books: IconBooks,
  notebook: IconNotebook,
  pencil: IconPencil,
  school: IconSchool,
  language: IconLanguage,
  login: IconLogin,
  settings: IconSettings,
  music: IconMusic,
  headphones: IconHeadphones,
  microphone: IconMicrophone,
  movie: IconMovie,
  camera: IconCamera,
  "device-gamepad-2": IconDeviceGamepad2,
  chess: IconChess,
  brush: IconBrush,
  palette: IconPalette,
  coffee: IconCoffee,
  "glass-full": IconGlassFull,
  bottle: IconBottle,
  "tools-kitchen-2": IconToolsKitchen2,
  "chef-hat": IconChefHat,
  plant: IconPlant,
  flower: IconFlower,
  paw: IconPaw,
  briefcase: IconBriefcase,
  "building-bank": IconBuildingBank,
  "shopping-cart": IconShoppingCart,
  "map-pin": IconMapPin,
  compass: IconCompass,
  plane: IconPlane,
  beach: IconBeach,
  sun: IconSun,
  moon: IconMoon,
  star: IconStar,
  flame: IconFlame,
  trophy: IconTrophy,
  target: IconTarget,
  activity: IconActivity,
  "chart-bar": IconChartBar,
  clock: IconClock,
  calendar: IconCalendar,
  gift: IconGift,
  users: IconUsers,
  world: IconWorld,
  "device-desktop": IconDeviceDesktop,
  "device-mobile": IconDeviceMobile,
};

export type CommonIconName = keyof typeof COMMON_ICONS;

/**
 * 按名取常用图标。
 * 用 `Object.hasOwn` 而不是 `COMMON_ICONS[name]`：后者对 `constructor` / `toString`
 * 这类名字会命中 Object.prototype，把一个原生函数当成图标组件去渲染。
 * 目前的图标名不会出现这些词，但"名字查不到就崩溃"这类事故不值得留口子。
 */
export function commonIcon(name: string): IconComponent | null {
  return Object.hasOwn(COMMON_ICONS, name) ? (COMMON_ICONS[name] ?? null) : null;
}
