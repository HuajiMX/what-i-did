/**
 * 品牌标记：与 web/public/favicon.svg、favicon.ico 同一个图形（3×3 格点，点亮的三个组成对角线）。
 * ICO 由 scripts/gen-favicon.mjs 生成，改图形时三处一起改。
 *
 * 这里不直接引 favicon.svg，而是内联绘制，原因是：
 *  ① 侧栏的方块底色由 CSS 变量控制（--accent），内联 SVG 能跟着主题走，<img> 不能；
 *  ② 图形只有 9 个 rect，内联比额外一次网络请求更省。
 * 两处图形的坐标必须保持一致——改动时记得两边一起改。
 *
 * 尺寸由外层容器决定（.brand-mark svg { width: 100% }）：
 * 早先这里写死 size=16 而容器 30px，结果只填了一半，四周多出一圈底色像边框。
 */
export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <g fill="currentColor" fillOpacity="0.26">
        <rect x="8" y="8" width="4" height="4" rx="1" />
        <rect x="14" y="8" width="4" height="4" rx="1" />
        <rect x="20" y="8" width="4" height="4" rx="1" />
        <rect x="8" y="14" width="4" height="4" rx="1" />
        <rect x="14" y="14" width="4" height="4" rx="1" />
        <rect x="20" y="14" width="4" height="4" rx="1" />
        <rect x="8" y="20" width="4" height="4" rx="1" />
        <rect x="14" y="20" width="4" height="4" rx="1" />
        <rect x="20" y="20" width="4" height="4" rx="1" />
      </g>
      <g fill="currentColor">
        <rect x="8" y="8" width="4" height="4" rx="1" />
        <rect x="14" y="14" width="4" height="4" rx="1" />
        <rect x="20" y="20" width="4" height="4" rx="1" />
      </g>
    </svg>
  );
}
