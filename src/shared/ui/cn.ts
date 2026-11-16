import { createCn } from 'cn/config'

// UX-DR7, UX-DR9, UX-DR11: the brand's own type, radius and shadow names, so a
// role like `text-page-title` merges as a font size and not as a color.
// Must match the `--text-*`, `--radius-*` and `--shadow-*` tokens in styles.css.
export const TEXT_ROLES = [
  'page-title',
  'detail-hero',
  'stat-value',
  'row-value',
  'card-value',
  'detail-name',
  'column-title',
  'body',
  'row-name',
  'meta',
  'tag',
  'path',
] as const

/** Brand radii beyond Tailwind's own `xs` and `full` (which styles.css resizes). */
export const RADIUS_ROLES = ['bar', 'row', 'card', 'panel', 'sheet'] as const

export const SHADOW_ROLES = ['card', 'float', 'sheet'] as const

export const cn = createCn({
  extend: {
    theme: {
      text: [...TEXT_ROLES],
      radius: [...RADIUS_ROLES],
      shadow: [...SHADOW_ROLES],
    },
  },
})
