import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RADIUS_ROLES, SHADOW_ROLES, cn } from '#/shared/ui/cn'

// Spec 1.3 matrix rows 21 and 22.

const UI_DIR = import.meta.dirname
const read = (file: string) => readFileSync(join(UI_DIR, file), 'utf8')

describe('shadcn components (row 21)', () => {
  it('DialogContent sits on the surface role, not the page background', () => {
    const source = read('dialog.tsx')
    const start = source.indexOf('function DialogContent(')
    const end = source.indexOf('function DialogHeader(')
    expect(start).toBeGreaterThan(-1)
    const content = source.slice(start, end)
    expect(content).toContain('bg-surface')
    expect(content).not.toContain('bg-background')
  })

  it('DialogContent and overlay use the brand radius, shadow and scrim', () => {
    const source = read('dialog.tsx')
    const content = source.slice(
      source.indexOf('function DialogContent('),
      source.indexOf('function DialogHeader('),
    )
    expect(content).toContain('rounded-panel')
    expect(content).toContain('shadow-float')
    expect(content).not.toMatch(/\brounded-lg\b|\bshadow-lg\b/)
    const overlay = source.slice(
      source.indexOf('function DialogOverlay('),
      source.indexOf('function DialogContent('),
    )
    expect(overlay).toContain('bg-scrim-dialog')
    expect(overlay).not.toContain('bg-black')
  })

  it('Button uses the brand delete colors and the global disabled look', () => {
    const source = read('button.tsx')
    expect(source).toContain('bg-destructive text-destructive-foreground')
    expect(source).not.toContain('text-white')
    expect(source).not.toContain('dark:bg-destructive')
    expect(source).not.toContain('disabled:opacity')
    expect(source).not.toContain('disabled:pointer-events-none')
  })

  it('leaves keyboard focus to the global :focus-visible outline', () => {
    const files = readdirSync(UI_DIR).filter((file) => file.endsWith('.tsx'))
    expect(files.sort()).toEqual(['button.tsx', 'dialog.tsx'])
    for (const file of files) {
      const source = read(file)
      for (const banned of [
        'outline-none',
        'outline-hidden',
        'focus:ring',
        'focus-visible:ring',
      ]) {
        expect(source, `${file}: ${banned}`).not.toContain(banned)
      }
    }
  })

  it('uses the token-aware cn and Chinese close text', () => {
    for (const file of ['button.tsx', 'dialog.tsx']) {
      expect(read(file)).toContain("from '#/shared/ui/cn'")
      expect(read(file)).not.toMatch(/from ['"]cn['"]/)
    }
    expect(read('dialog.tsx')).not.toMatch(/>\s*Close\s*</)
    expect(read('dialog.tsx').match(/關閉/g)).toHaveLength(2)
  })
})

describe('cn merge (row 22)', () => {
  it('keeps a type role next to a text color', () => {
    expect(cn('text-page-title', 'text-foreground')).toBe(
      'text-page-title text-foreground',
    )
  })

  it.each(RADIUS_ROLES.map((role) => [role]))(
    'treats rounded-%s as a radius',
    (role) => {
      expect(cn(`rounded-${role}`, 'rounded-lg')).toBe('rounded-lg')
    },
  )

  it.each(SHADOW_ROLES.map((role) => [role]))(
    'treats shadow-%s as a shadow',
    (role) => {
      expect(cn(`shadow-${role}`, 'shadow-lg')).toBe('shadow-lg')
    },
  )

  it('merges two type roles as font sizes', () => {
    expect(cn('text-body', 'text-card-value')).toBe('text-card-value')
  })
})
