import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RADIUS_ROLES, SHADOW_ROLES, TEXT_ROLES } from '#/shared/ui/cn'

// Spec 1.3 matrix rows 18 to 20. The expected values are copied from the UX
// DESIGN.md frontmatter (written out here, no YAML parser).

const CSS = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8')
const SOURCE = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

interface Block {
  prelude: string
  body: string
}

/** The `prelude { body }` blocks at the top level of `css`. */
function blocks(css: string): Array<Block> {
  const found: Array<Block> = []
  let depth = 0
  let preludeStart = 0
  let bodyStart = 0
  for (let i = 0; i < css.length; i += 1) {
    const char = css[i]
    if (char === '{') {
      if (depth === 0) bodyStart = i + 1
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        const prelude = css
          .slice(preludeStart, bodyStart - 1)
          .replace(/\s+/g, ' ')
          .replace(/"/g, "'")
          .trim()
        found.push({ prelude, body: css.slice(bodyStart, i) })
        preludeStart = i + 1
      }
    } else if (char === ';' && depth === 0) {
      preludeStart = i + 1
    }
  }
  return found
}

/** Declarations directly in `body` (nested blocks skipped). */
function declarations(body: string): Map<string, string> {
  let flat = ''
  let depth = 0
  for (const char of body) {
    if (char === '{') depth += 1
    if (depth === 0) flat += char
    if (char === '}') {
      depth -= 1
      if (depth === 0) flat += ';'
    }
  }
  const result = new Map<string, string>()
  for (const part of flat.split(';')) {
    const colon = part.indexOf(':')
    if (colon === -1) continue
    const name = part.slice(0, colon).trim()
    if (!name || name.includes('{') || name.includes('}')) continue
    result.set(
      name,
      part
        .slice(colon + 1)
        .replace(/\s+/g, ' ')
        .trim(),
    )
  }
  return result
}

function merged(selected: Array<Block>): Map<string, string> {
  const result = new Map<string, string>()
  for (const block of selected) {
    for (const [name, value] of declarations(block.body))
      result.set(name, value)
  }
  return result
}

const TOP = blocks(SOURCE)
const byPrelude = (prelude: string) => TOP.filter((b) => b.prelude === prelude)

const LIGHT = merged(byPrelude(':root'))
const darkMedia = byPrelude('@media (prefers-color-scheme: dark)')
const DARK = merged(
  darkMedia
    .flatMap((media) => blocks(media.body))
    .filter((b) => b.prelude === ':root'),
)
const THEME = merged(byPrelude('@theme'))
const THEME_INLINE = merged(byPrelude('@theme inline'))
const BASE = blocks(
  byPrelude('@layer base')
    .map((b) => b.body)
    .join('\n'),
)

// Row 18: UX-DR1 to UX-DR3, [light, dark].
const ROLES: Record<string, [string, string]> = {
  'surface-page': ['#F6F6F4', '#1F2937'],
  surface: ['#FFFFFF', '#18202C'],
  'surface-muted': ['#EFEFEC', '#263243'],
  border: ['#E4E4E0', '#2D3A4D'],
  track: ['#E7E7E3', '#334155'],
  text: ['#141414', '#E9EEF5'],
  'text-muted': ['#65655F', '#95A1B2'],
  'text-faint': ['#8C8C87', '#67758A'],
  accent: ['#141414', '#6CB4E4'],
  'accent-foreground': ['#FFFFFF', '#0F1720'],
  'selection-row': ['#EEF4FF', '#25344A'],
  'selection-bar': ['#141414', '#E9EEF5'],
  'selection-bar-foreground': ['#FFFFFF', '#0F1720'],
  delete: ['#D93A3A', '#E0707F'],
  'delete-foreground': ['#FFFFFF', '#0F1720'],
  good: ['#18753F', '#8FD19E'],
  'media-library': ['#6A45C8', '#A48FE0'],
  'media-library-tint': ['#6A45C81F', '#6A45C81F'],
  'status-downloading': ['#2F6FDF', '#5AA9E0'],
  'status-seeding': ['#278A4F', '#7FBF8E'],
  'status-done': ['#141414', '#7D8BA0'],
  'status-paused': ['#B26F0C', '#E0AD62'],
  'status-stalled': ['#C9581E', '#E3925F'],
  'status-error': ['#D93A3A', '#E0707F'],
  'status-archived': ['#65655F', '#95A1B2'],
  'status-icon': ['#FFFFFF', '#0F1720'],
}

// Row 19: UX-DR4 shadcn variable -> brand role.
const SHADCN: Record<string, string> = {
  background: 'surface-page',
  foreground: 'text',
  card: 'surface',
  'card-foreground': 'text',
  popover: 'surface',
  'popover-foreground': 'text',
  primary: 'accent',
  'primary-foreground': 'accent-foreground',
  secondary: 'surface-muted',
  'secondary-foreground': 'text',
  muted: 'surface-muted',
  'muted-foreground': 'text-muted',
  accent: 'surface-muted',
  'accent-foreground': 'text',
  destructive: 'delete',
  'destructive-foreground': 'delete-foreground',
  border: 'border',
  input: 'border',
  ring: 'accent',
}

// Row 20: UX-DR7 type roles, [size, weight, line height].
const TEXT: Record<string, [string, string, string]> = {
  'page-title': ['26px', '700', '1.2'],
  'detail-hero': ['28px', '700', '1.2'],
  'stat-value': ['20px', '700', '1.2'],
  'row-value': ['18px', '700', '1.2'],
  'detail-name': ['16px', '700', '1.2'],
  'column-title': ['15px', '700', '1.2'],
  body: ['13px', '400', '1.4'],
  'row-name': ['13px', '600', '1.4'],
  meta: ['12px', '400', '1.4'],
  tag: ['11px', '400', '1.4'],
  path: ['12px', '400', '1.5'],
}

const RADII: Record<string, string> = {
  xs: '6px',
  bar: '9px',
  row: '14px',
  card: '16px',
  panel: '22px',
  sheet: '28px',
  full: '9999px',
}

const SHADOWS: Record<string, string> = {
  card: '0 1px 2px rgba(0, 0, 0, 0.05)',
  float: '0 12px 32px rgba(0, 0, 0, 0.28)',
  sheet: '0 -12px 40px rgba(0, 0, 0, 0.18)',
}

const SPACING: Record<string, string> = {
  'page-desktop': '22px 28px',
  'page-desktop-bottom': '110px',
  'page-phone': '18px 16px',
  'page-phone-list': '18px 12px',
  'board-gap': '14px',
  'card-padding': '12px 14px',
  'row-padding-desktop': '9px 12px',
  'row-padding-phone': '9px 10px',
  'panel-padding': '18px 22px',
}

const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
const FONT_MONO = "'SF Mono', ui-monospace, Menlo, monospace"

/** rgba(0,0,0,.18) and rgba(0, 0, 0, 0.18) compare equal. */
const normalize = (value: string | undefined) =>
  (value ?? '')
    .toLowerCase()
    .replace(/"/g, "'")
    .replace(/\s+/g, '')
    .replace(/(^|[^0-9])\.(\d)/g, '$10.$2')

describe('color tokens (row 18)', () => {
  it('defines 26 roles', () => {
    expect(Object.keys(ROLES)).toHaveLength(26)
  })

  it.each(Object.entries(ROLES))('--rt-%s', (role, [light, dark]) => {
    expect(LIGHT.get(`--rt-${role}`)?.toUpperCase()).toBe(light)
    expect(DARK.get(`--rt-${role}`)?.toUpperCase()).toBe(dark)
  })

  it('switches only through prefers-color-scheme', () => {
    expect(darkMedia).toHaveLength(1)
    expect(LIGHT.get('color-scheme')).toBe('light dark')
    expect(SOURCE).not.toMatch(/\.dark\b/)
    expect(SOURCE).not.toContain('@custom-variant')
    expect(SOURCE).not.toContain('@variant dark')
  })
})

describe('shadcn mapping (row 19)', () => {
  it.each(Object.entries(SHADCN))('--%s', (name, role) => {
    expect(LIGHT.get(`--${name}`)).toBe(`var(--rt-${role})`)
    // Dark mode reuses the same mapping through the roles.
    expect(DARK.has(`--${name}`)).toBe(false)
  })

  it('maps no sidebar or chart variables', () => {
    const names = [...LIGHT.keys()]
    expect(names.filter((n) => /^--(sidebar|chart)/.test(n))).toEqual([])
  })
})

describe('Tailwind theme (row 20)', () => {
  it('resets the palette to the roles plus black and white', () => {
    expect(THEME.get('--color-*')).toBe('initial')
    const literalColors = [...THEME.keys()].filter(
      (n) => n.startsWith('--color-') && n !== '--color-*',
    )
    expect(literalColors.sort()).toEqual([
      '--color-black',
      '--color-scrim-dialog',
      '--color-scrim-sheet',
      '--color-white',
    ])
    expect(normalize(THEME.get('--color-scrim-sheet'))).toBe(
      normalize('rgba(0,0,0,.18)'),
    )
    expect(normalize(THEME.get('--color-scrim-dialog'))).toBe(
      normalize('rgba(0,0,0,.5)'),
    )
  })

  it('exposes every shadcn variable and every role except the brand accent', () => {
    for (const name of Object.keys(SHADCN)) {
      expect(THEME_INLINE.get(`--color-${name}`), name).toBe(`var(--${name})`)
    }
    for (const role of Object.keys(ROLES)) {
      if (
        role === 'accent' ||
        role === 'accent-foreground' ||
        role === 'border'
      )
        continue
      expect(THEME_INLINE.get(`--color-${role}`), role).toBe(
        `var(--rt-${role})`,
      )
    }
  })

  it('has both font stacks', () => {
    expect(normalize(THEME.get('--font-sans'))).toBe(normalize(FONT_SANS))
    expect(normalize(THEME.get('--font-mono'))).toBe(normalize(FONT_MONO))
  })

  it('has the 12 text roles', () => {
    expect([...Object.keys(TEXT), 'card-value'].sort()).toEqual(
      [...TEXT_ROLES].sort(),
    )
    for (const [role, [size, weight, lineHeight]] of Object.entries(TEXT)) {
      expect(THEME.get(`--text-${role}`), role).toBe(size)
      expect(THEME.get(`--text-${role}--font-weight`), role).toBe(weight)
      expect(THEME.get(`--text-${role}--line-height`), role).toBe(lineHeight)
    }
    const cardValue = byPrelude('@utility text-card-value')
    expect(cardValue).toHaveLength(1)
    const phone = declarations(cardValue[0].body)
    expect(phone.get('font-size')).toBe('22px')
    expect(phone.get('font-weight')).toBe('700')
    expect(phone.get('line-height')).toBe('1.2')
    const desktop = blocks(cardValue[0].body)
    expect(desktop.map((b) => b.prelude)).toEqual(['@media (width >= 64rem)'])
    expect(declarations(desktop[0].body).get('font-size')).toBe('17px')
  })

  it('has the 7 radii, 3 shadows, named spacings and content widths', () => {
    for (const [name, value] of Object.entries(RADII)) {
      expect(THEME.get(`--radius-${name}`), name).toBe(value)
    }
    for (const [name, value] of Object.entries(SHADOWS)) {
      expect(normalize(THEME.get(`--shadow-${name}`)), name).toBe(
        normalize(value),
      )
    }
    for (const [name, value] of Object.entries(SPACING)) {
      expect(THEME.get(`--spacing-${name}`), name).toBe(value)
    }
    expect(THEME.get('--container-content-max')).toBe('1240px')
    expect(THEME.get('--container-list-column-max')).toBe('560px')
  })

  it('matches the radius and shadow names cn knows', () => {
    const tokens = (prefix: string) =>
      [...THEME.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => name.slice(prefix.length))
    expect(
      tokens('--radius-').filter((n) => n !== 'xs' && n !== 'full'),
    ).toEqual([...RADIUS_ROLES])
    expect(tokens('--shadow-')).toEqual([...SHADOW_ROLES])
  })

  it('has the four hover utilities, never on disabled things', () => {
    for (const name of [
      'hover-row',
      'hover-ring',
      'hover-outline',
      'hover-solid',
    ]) {
      const utility = byPrelude(`@utility ${name}`)
      expect(utility, name).toHaveLength(1)
      const nested = blocks(utility[0].body)
      expect(nested.map((b) => b.prelude)).toEqual([
        '@media (hover: hover)',
        "&:active:not(:disabled, [aria-disabled='true'])",
      ])
      expect(blocks(nested[0].body).map((b) => b.prelude)).toEqual([
        "&:hover:not(:disabled, [aria-disabled='true'])",
      ])
    }
  })

  it('has the rise entrance, off for reduced motion (spec 1.4)', () => {
    const keyframes = byPrelude('@keyframes rise')
    expect(keyframes).toHaveLength(1)
    const from = blocks(keyframes[0].body)
    expect(from.map((b) => b.prelude)).toEqual(['from'])
    const fromDecl = declarations(from[0].body)
    expect(fromDecl.get('opacity')).toBe('0')
    expect(fromDecl.get('transform')).toBe('translateY(10px)')
    expect([...fromDecl.keys()].sort()).toEqual(['opacity', 'transform'])

    const utility = byPrelude('@utility animate-rise')
    expect(utility).toHaveLength(1)
    expect(declarations(utility[0].body).get('animation')).toBe(
      'rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both',
    )
    const reduced = blocks(utility[0].body)
    expect(reduced.map((b) => b.prelude)).toEqual([
      '@media (prefers-reduced-motion: reduce)',
    ])
    expect(declarations(reduced[0].body).get('animation')).toBe('none')
  })

  it('has the skeleton pulse, opacity only, off for reduced motion (spec 1.7)', () => {
    const keyframes = byPrelude('@keyframes skeleton-pulse')
    expect(keyframes).toHaveLength(1)
    const steps = blocks(keyframes[0].body)
    expect(steps.map((b) => b.prelude)).toEqual(['50%'])
    expect([...declarations(steps[0].body)]).toEqual([['opacity', '0.55']])

    const utility = byPrelude('@utility animate-skeleton')
    expect(utility).toHaveLength(1)
    expect(declarations(utility[0].body).get('animation')).toBe(
      'skeleton-pulse 1.6s ease-in-out infinite',
    )
    const reduced = blocks(utility[0].body)
    expect(reduced.map((b) => b.prelude)).toEqual([
      '@media (prefers-reduced-motion: reduce)',
    ])
    expect(declarations(reduced[0].body).get('animation')).toBe('none')
  })

  it('sets body, focus and disabled base rules', () => {
    const rule = (prelude: string) => {
      const found = BASE.filter((b) => b.prelude === prelude)
      expect(found, prelude).toHaveLength(1)
      return declarations(found[0].body)
    }
    const body = rule('body')
    expect(body.get('font-variant-numeric')).toBe('tabular-nums')
    expect(body.get('background-color')).toBe('var(--background)')
    expect(body.get('color')).toBe('var(--foreground)')
    expect(body.get('font-family')).toBe('var(--font-sans)')
    expect(body.get('font-size')).toBe('var(--text-body)')
    expect(body.get('line-height')).toBe('var(--text-body--line-height)')

    const focus = rule(':focus-visible')
    expect(focus.get('outline')).toBe('2px solid var(--ring)')
    expect(focus.get('outline-offset')).toBe('2px')

    const disabled = rule(":disabled, [aria-disabled='true']")
    expect(disabled.get('opacity')).toBe('0.5')
    expect(disabled.get('cursor')).toBe('not-allowed')

    // A disabled thing inside a disabled group is not dimmed twice.
    const nested = rule(
      "[aria-disabled='true'] :is(:disabled, [aria-disabled='true']), fieldset:disabled :is(:disabled, [aria-disabled='true'])",
    )
    expect(nested.get('opacity')).toBe('1')
  })

  it('loads no fonts or remote files', () => {
    expect(CSS).not.toContain('@font-face')
    expect(CSS).not.toContain('@import url(')
    expect(CSS).not.toContain('http')
  })
})
