import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { ESLint } from 'eslint'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Guards the layer boundaries, the AD-10 raw-HTML bans, the AD-5
// createServerFn ban, the cn and src/shared/ui bans and the AD-16
// no-console rule in eslint.config.js.
// If a plugin or resolver change silently disables them, these tests go red.

const ROOT = join(import.meta.dirname, '..')

const RAW_HTML_FORMS = [
  `const a = <div dangerouslySetInnerHTML={{ __html: '' }} />`,
  `const b = { dangerouslySetInnerHTML: { __html: '' } }`,
  `const c = { 'dangerouslySetInnerHTML': { __html: '' } }`,
  `el.innerHTML = ''`,
  `el['outerHTML'] = ''`,
  `document.write('')`,
  `document.writeln('')`,
  `window.document.write('')`,
  `globalThis.document.write('')`,
  `document['write']('')`,
  `el.insertAdjacentHTML('beforeend', '')`,
  `document.createRange().createContextualFragment('')`,
  `el.setHTMLUnsafe('')`,
]

const RAW_HTML_FILE = 'src/lib/lint-probe-html.tsx'
const RAW_HTML_SOURCE = [
  `const el = document.createElement('div')`,
  ...RAW_HTML_FORMS,
  `export { a, b, c }`,
  '',
].join('\n')

// Files written for the test; targets only need to exist.
const FIXTURES: Record<string, string> = {
  'src/state/lint-probe-target.ts': 'export const target = 1\n',
  'src/server/qbit/lint-probe-target.ts': 'export const target = 1\n',
  'src/lib/lint-probe-target.ts': 'export const target = 1\n',
  'src/features/lint-probe-b/target.ts': 'export const target = 1\n',
  'src/lib/lint-probe-to-state.ts':
    "import { target } from '#/state/lint-probe-target'\n\nexport const x = target\n",
  'src/lib/lint-probe-to-root.ts':
    "import { getRouter } from '../router'\n\nexport const x = getRouter\n",
  'src/state/lint-probe-to-server.ts':
    "import { target } from '#/server/qbit/lint-probe-target'\n\nexport const x = target\n",
  'src/routes/-lint-probe-to-server.ts':
    "import { target } from '#/server/qbit/lint-probe-target'\n\nexport const x = target\n",
  'src/routes/-lint-probe-to-lib.ts':
    "import { target } from '#/lib/lint-probe-target'\n\nexport const x = target\n",
  'src/features/lint-probe-a/relative.ts':
    "import { target } from '../lint-probe-b/target'\n\nexport const x = target\n",
  'src/features/lint-probe-a/alias.ts':
    "import { target } from '#/features/lint-probe-b/target'\n\nexport const x = target\n",
  'src/lint-probe-root-to-lib.ts':
    "import { target } from '#/lib/lint-probe-target'\n\nexport const x = target\n",
  'src/components/lint-probe.ts': 'export const x = 1\n',
  [RAW_HTML_FILE]: RAW_HTML_SOURCE,
  'src/lib/lint-probe-create-server-fn.ts':
    "import { createServerFn } from '@tanstack/react-start'\n\nexport const x = createServerFn\n",
  'src/server/qbit/lint-probe-create-server-fn.ts':
    "import { createServerFn as make } from '@tanstack/start-client-core'\n\nexport const x = make\n",
  'src/server/qbit/lint-probe-console.ts':
    "console.log('x')\n\nexport const x = 1\n",
  'src/lib/lint-probe-define-alias.ts':
    "import { serverGet } from '#/server/functions/_define'\n\nexport const x = serverGet\n",
  'src/routes/-lint-probe-define-relative.ts':
    "import { serverPost } from '../server/functions/_define.ts'\n\nexport const x = serverPost\n",
  'src/routes/-lint-probe-cn.tsx':
    "import { cn } from 'cn'\n\nexport const x = cn\n",
  'src/server/qbit/lint-probe-ui.ts':
    "import { Button } from '#/shared/ui/button'\n\nexport const x = Button\n",
  'src/server/qbit/lint-probe-ui-relative.ts':
    "import { cn } from '../../shared/ui/cn'\n\nexport const x = cn\n",
  'src/lib/lint-probe-ui.ts':
    "import { Button } from '#/shared/ui/button'\n\nexport const x = Button\n",
  'src/state/lint-probe-ui.ts':
    "import { Button } from '#/shared/ui/button'\n\nexport const x = Button\n",
  // Subfolder so server function discovery never picks it up.
  'src/server/functions/lint-probe/ui.ts':
    "import { Button } from '#/shared/ui/button'\nimport { cn } from 'cn'\n\nexport const x = [Button, cn]\n",
  'src/lib/lint-probe-cn.ts':
    "import { cn } from 'cn'\n\nexport const x = cn\n",
  'src/shared/lint-probe-ui.ts':
    "import { Button } from '#/shared/ui/button'\n\nexport const x = Button\n",
  'src/routes/-lint-probe-ui.tsx':
    "import { Button } from '#/shared/ui/button'\n\nexport const x = Button\n",
  'src/lib/lint-probe-zod.ts':
    "import { z } from 'zod'\n\nexport const x = z\n",
  'src/routes/-lint-probe-zod.ts':
    "import { z } from 'zod/v4'\n\nexport const x = z\n",
  'src/shared/lint-probe-zod.ts':
    "import { z } from 'zod'\n\nexport const x = z\n",
  'src/server/qbit/lint-probe-zod.ts':
    "import { z } from 'zod'\n\nexport const x = z\n",
}

// Real files linted alongside the probes (read only).
const REAL_FILES = [
  'src/server/functions/_define.ts',
  'src/server/functions/__fixtures__/sample.ts',
  'src/shared/ui/cn.ts',
  'src/shared/zod.ts',
]

const createdDirs: Array<string> = []
const results = new Map<string, Array<ESLint.LintResult['messages'][number]>>()

function ruleIds(file: string): Array<string | null> {
  const messages = results.get(file)
  if (!messages) throw new Error(`no lint result for ${file}`)
  return messages.map((message) => message.ruleId)
}

beforeAll(async () => {
  for (const [file, source] of Object.entries(FIXTURES)) {
    const dir = dirname(join(ROOT, file))
    if (!existsSync(dir)) {
      // Remember the outermost new directory so cleanup removes all of it.
      let top = dir
      while (!existsSync(dirname(top))) top = dirname(top)
      createdDirs.push(top)
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(join(ROOT, file), source)
  }

  const eslint = new ESLint({ cwd: ROOT })
  const lintResults = await eslint.lintFiles([
    ...Object.keys(FIXTURES),
    ...REAL_FILES,
  ])
  for (const result of lintResults) {
    results.set(relative(ROOT, result.filePath), result.messages)
  }
}, 120_000)

afterAll(() => {
  for (const file of Object.keys(FIXTURES))
    rmSync(join(ROOT, file), { force: true })
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true })
})

describe('layer boundaries', () => {
  it.each([
    ['lib -> state', 'src/lib/lint-probe-to-state.ts'],
    ['lib -> root file (router)', 'src/lib/lint-probe-to-root.ts'],
    ['state -> server', 'src/state/lint-probe-to-server.ts'],
    ['route -> server', 'src/routes/-lint-probe-to-server.ts'],
    [
      'feature a -> feature b (relative)',
      'src/features/lint-probe-a/relative.ts',
    ],
    ['feature a -> feature b (#/ alias)', 'src/features/lint-probe-a/alias.ts'],
  ])('blocks %s', (_name, file) => {
    expect(ruleIds(file)).toContain('boundaries/dependencies')
  })

  it('blocks files outside the layer map', () => {
    expect(ruleIds('src/components/lint-probe.ts')).toContain(
      'boundaries/no-unknown-files',
    )
  })

  it.each([
    ['route -> lib', 'src/routes/-lint-probe-to-lib.ts'],
    ['root file -> lib', 'src/lint-probe-root-to-lib.ts'],
  ])('allows %s', (_name, file) => {
    const boundaryErrors = ruleIds(file).filter((id) =>
      id?.startsWith('boundaries/'),
    )
    expect(boundaryErrors).toEqual([])
  })
})

describe('AD-10 raw HTML bans', () => {
  it.each(RAW_HTML_FORMS.map((form, index) => [form, index + 2]))(
    'blocks %s',
    (_form, line) => {
      const messages = results.get(RAW_HTML_FILE) ?? []
      const hit = messages.some(
        (message) =>
          message.line === line && message.ruleId === 'no-restricted-syntax',
      )
      expect(hit).toBe(true)
    },
  )
})

describe('AD-5 createServerFn only in _define.ts', () => {
  it.each([
    ['@tanstack/react-start', 'src/lib/lint-probe-create-server-fn.ts'],
    [
      '@tanstack/start-client-core (renamed)',
      'src/server/qbit/lint-probe-create-server-fn.ts',
    ],
  ])('blocks importing it from %s outside _define.ts', (_name, file) => {
    expect(ruleIds(file)).toContain('no-restricted-imports')
  })

  it('allows it in src/server/functions/_define.ts', () => {
    expect(ruleIds('src/server/functions/_define.ts')).not.toContain(
      'no-restricted-imports',
    )
  })
})

describe('AD-5 the factory is imported only under src/server/functions', () => {
  it.each([
    ['#/ alias from src/lib', 'src/lib/lint-probe-define-alias.ts'],
    [
      'relative path from src/routes',
      'src/routes/-lint-probe-define-relative.ts',
    ],
  ])('blocks %s', (_name, file) => {
    expect(ruleIds(file)).toContain('no-restricted-imports')
  })

  it('allows it inside src/server/functions', () => {
    expect(
      ruleIds('src/server/functions/__fixtures__/sample.ts'),
    ).not.toContain('no-restricted-imports')
  })
})

describe('AD-16 only src/server/log writes logs', () => {
  it('blocks console in src/server', () => {
    expect(ruleIds('src/server/qbit/lint-probe-console.ts')).toContain(
      'no-console',
    )
  })
})

describe('cn only through src/shared/ui/cn.ts', () => {
  it.each([
    ['a route', 'src/routes/-lint-probe-cn.tsx'],
    ['src/lib', 'src/lib/lint-probe-cn.ts'],
  ])('blocks the cn package in %s', (_name, file) => {
    expect(ruleIds(file)).toContain('no-restricted-imports')
  })

  it('blocks both cn and src/shared/ui under src/server/functions', () => {
    const hits = ruleIds('src/server/functions/lint-probe/ui.ts').filter(
      (id) => id === 'no-restricted-imports',
    )
    expect(hits).toHaveLength(2)
  })

  it('allows it in src/shared/ui/cn.ts', () => {
    expect(ruleIds('src/shared/ui/cn.ts')).toEqual([])
  })
})

describe('src/shared/ui only from screens', () => {
  it.each([
    ['src/server (#/ alias)', 'src/server/qbit/lint-probe-ui.ts'],
    ['src/server (relative)', 'src/server/qbit/lint-probe-ui-relative.ts'],
    ['src/lib', 'src/lib/lint-probe-ui.ts'],
    ['src/state', 'src/state/lint-probe-ui.ts'],
    ['src/shared outside ui/', 'src/shared/lint-probe-ui.ts'],
  ])('blocks it from %s', (_name, file) => {
    expect(ruleIds(file)).toContain('no-restricted-imports')
  })

  it('allows it from a route', () => {
    expect(ruleIds('src/routes/-lint-probe-ui.tsx')).toEqual([])
  })
})

describe('AD-10 zod only through src/shared/zod.ts outside src/server', () => {
  it.each([
    ['src/lib', 'src/lib/lint-probe-zod.ts'],
    ['a route (zod/v4 subpath)', 'src/routes/-lint-probe-zod.ts'],
    ['src/shared', 'src/shared/lint-probe-zod.ts'],
  ])('blocks importing zod from %s', (_name, file) => {
    expect(ruleIds(file)).toContain('no-restricted-imports')
  })

  it('allows it in src/server and in src/shared/zod.ts', () => {
    expect(ruleIds('src/server/qbit/lint-probe-zod.ts')).not.toContain(
      'no-restricted-imports',
    )
    expect(ruleIds('src/shared/zod.ts')).toEqual([])
  })
})
