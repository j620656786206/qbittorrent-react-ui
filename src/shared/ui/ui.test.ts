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
    // Story 3.7: DialogContent draws its own scrim (non-modal Radix).
    const overlay = source.slice(
      source.indexOf('const SCRIM_CLASS'),
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

  it('Button is a capsule and the default variant is button-primary (spec 1.4)', () => {
    const source = read('button.tsx')
    expect(source).not.toContain('rounded-md')
    expect(source).toContain('rounded-full')
    expect(source).toContain(
      "default: 'bg-primary font-bold text-primary-foreground hover-solid'",
    )
    expect(source).not.toContain('hover:bg-primary/90')
  })

  it('Input and Checkbox use the DESIGN text-input and checkbox looks (spec 1.4)', () => {
    const input = read('input.tsx')
    for (const token of [
      'rounded-full',
      'border-input',
      'bg-card',
      'px-4',
      'text-body',
      'aria-invalid:border-destructive',
    ]) {
      expect(input, token).toContain(token)
    }
    expect(input).not.toMatch(/\bh-\d/)
    expect(input).not.toContain('shadow')
    expect(input).not.toContain('disabled:opacity')
    const checkbox = read('checkbox.tsx')
    for (const token of [
      'size-5',
      'rounded-xs',
      'border-2 border-text-faint',
      'data-[state=checked]:border-0',
      'data-[state=checked]:bg-primary',
      'data-[state=checked]:text-primary-foreground',
      'strokeWidth={3}',
      'size-3.5',
    ]) {
      expect(checkbox, token).toContain(token)
    }
    expect(checkbox).not.toContain('disabled:opacity')
  })

  it('leaves keyboard focus to the global :focus-visible outline', () => {
    const files = readdirSync(UI_DIR).filter(
      (file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'),
    )
    expect(files.sort()).toEqual([
      'alert-bar.tsx',
      'bottom-sheet.tsx',
      'button.tsx',
      'checkbox.tsx',
      'confirm-shell.tsx',
      'dialog.tsx',
      'dropdown-menu.tsx',
      'input.tsx',
      'list-blocks.tsx',
      'location-tag.tsx',
      'skeleton.tsx',
      'status-circle.tsx',
      'toaster.tsx',
    ])
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
    for (const file of [
      'alert-bar.tsx',
      'bottom-sheet.tsx',
      'button.tsx',
      'checkbox.tsx',
      'dialog.tsx',
      'dropdown-menu.tsx',
      'input.tsx',
    ]) {
      expect(read(file)).toContain("from '#/shared/ui/cn'")
      expect(read(file)).not.toMatch(/from ['"]cn['"]/)
    }
    expect(read('dialog.tsx')).not.toMatch(/>\s*Close\s*</)
    expect(read('dialog.tsx').match(/關閉/g)).toHaveLength(2)
  })
})

describe('DropdownMenu (story 2.1, DESIGN sort-menu)', () => {
  const source = read('dropdown-menu.tsx')

  it('is non-modal by default, so no injected <style> meets the CSP', () => {
    expect(source).toContain('modal = false')
    expect(source).toContain('modal={modal}')
  })

  it('uses the brand surface, radius, shadow and the 70vh cap', () => {
    const content = source.slice(
      source.indexOf('function DropdownMenuContent('),
      source.indexOf('function DropdownMenuGroup('),
    )
    for (const token of [
      'bg-surface',
      'rounded-card',
      'shadow-float',
      'border',
      'overflow-y-auto',
      'max-h-[min(70vh,',
    ]) {
      expect(content, token).toContain(token)
    }
    expect(content).not.toMatch(/\bshadow-md\b|\brounded-md\b|bg-popover/)
  })

  it('rows are 36px with the row radius and a surface-muted highlight', () => {
    expect(source).toContain('h-9')
    expect(source).toContain('rounded-row')
    expect(source).toContain('data-highlighted:bg-surface-muted')
    expect(source).toContain('text-tag text-text-muted')
  })
})

describe('BottomSheet (story 2.2, DESIGN bottom-sheet)', () => {
  const source = read('bottom-sheet.tsx')

  it('uses the brand surface, sheet radius, sheet shadow and scrim', () => {
    for (const token of [
      'bg-surface',
      'rounded-t-sheet',
      'shadow-sheet',
      'bg-scrim-sheet',
      'pt-[env(safe-area-inset-top)]',
      'h-[5px] w-11 rounded-full',
      'h-5 justify-center pt-2',
      'text-[16px] leading-[1.2] font-bold',
      "closeLabel = '關閉'",
      'aria-label={closeLabel}',
      'size-11',
      "role = 'dialog'",
      'role={role}',
      'aria-modal="true"',
    ]) {
      expect(source, token).toContain(token)
    }
  })

  it('has the mockup motion and never adds a <style> element (CSP)', () => {
    expect(source).toContain('SHEET_MOTION_MS = 550')
    expect(source).toContain("SHEET_EASING = 'cubic-bezier(.2,.85,.25,1)'")
    expect(source).toContain('SHEET_START_SHARE = 0.6')
    const code = source.replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/createElement\(\s*['"]style/)
    expect(code).not.toContain('<style')
    expect(code).not.toContain("setAttribute('style'")
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

describe('Skeleton (spec 1.8, UX-DR88)', () => {
  it('is the shadcn slot with the brand pulse and surface', () => {
    const source = read('skeleton.tsx')
    expect(source).toContain('data-slot="skeleton"')
    expect(source).toContain('aria-hidden="true"')
    expect(source).toContain('animate-skeleton bg-surface-muted')
    expect(source).not.toContain('animate-pulse')
  })
})
