import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Linter } from 'eslint'

// Guards the layer boundaries, the AD-10 raw-HTML bans, the AD-5
// createServerFn ban, the cn and src/shared/ui bans and the AD-16
// no-console rule in eslint.config.js.
// If a plugin or resolver change silently disables them, these tests go red.
//
// Probes are linted from memory with `lintText` at virtual paths, so nothing
// is written into src/ (a concurrent lint or commit never sees them). Import
// targets are real files.

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

/** A real feature to import across from a virtual sibling feature. */
function realFeatureModule(): { name: string; file: string } {
  const featuresDir = join(ROOT, 'src/features')
  for (const name of readdirSync(featuresDir).sort()) {
    const files = readdirSync(join(featuresDir, name)).filter(
      (file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file),
    )
    if (files.length > 0) return { name, file: files[0].replace(/\.tsx?$/, '') }
  }
  throw new Error('src/features has no module to probe cross-feature imports')
}

const feature = realFeatureModule()
const importFrom = (specifier: string, name: string) =>
  `import { ${name} } from '${specifier}'\n\nexport const x = ${name}\n`

const PROBES: Record<string, string> = {
  'src/lib/lint-probe-to-state.ts': importFrom(
    '#/state/polling',
    'pollInterval',
  ),
  'src/lib/lint-probe-to-root.ts': importFrom('../router', 'getRouter'),
  'src/state/lint-probe-to-server.ts': importFrom('#/server/log', 'log'),
  'src/routes/-lint-probe-to-server.ts': importFrom('#/server/log', 'log'),
  'src/routes/-lint-probe-to-lib.ts': importFrom('#/lib/app-error', 'AppError'),
  'src/features/lint-probe/relative.ts': `import * as other from '../${feature.name}/${feature.file}'\n\nexport const x = other\n`,
  'src/features/lint-probe/alias.ts': `import * as other from '#/features/${feature.name}/${feature.file}'\n\nexport const x = other\n`,
  'src/lint-probe-root-to-lib.ts': importFrom('#/lib/app-error', 'AppError'),
  'src/components/lint-probe.ts': 'export const x = 1\n',
  [RAW_HTML_FILE]: RAW_HTML_SOURCE,
  'src/lib/lint-probe-create-server-fn.ts':
    "import { createServerFn } from '@tanstack/react-start'\n\nexport const x = createServerFn\n",
  'src/server/qbit/lint-probe-create-server-fn.ts':
    "import { createServerFn as make } from '@tanstack/start-client-core'\n\nexport const x = make\n",
  'src/server/qbit/lint-probe-console.ts':
    "console.log('x')\n\nexport const x = 1\n",
  'src/lib/lint-probe-define-alias.ts': importFrom(
    '#/server/functions/_define',
    'serverGet',
  ),
  'src/routes/-lint-probe-define-relative.ts': importFrom(
    '../server/functions/_define.ts',
    'serverPost',
  ),
  'src/routes/-lint-probe-cn.tsx': importFrom('cn', 'cn'),
  'src/server/qbit/lint-probe-ui.ts': importFrom(
    '#/shared/ui/button',
    'Button',
  ),
  'src/server/qbit/lint-probe-ui-relative.ts': importFrom(
    '../../shared/ui/cn',
    'cn',
  ),
  'src/lib/lint-probe-ui.ts': importFrom('#/shared/ui/button', 'Button'),
  'src/state/lint-probe-ui.ts': importFrom('#/shared/ui/button', 'Button'),
  'src/server/functions/lint-probe/ui.ts':
    "import { Button } from '#/shared/ui/button'\nimport { cn } from 'cn'\n\nexport const x = [Button, cn]\n",
  'src/lib/lint-probe-cn.ts': importFrom('cn', 'cn'),
  'src/shared/lint-probe-ui.ts': importFrom('#/shared/ui/button', 'Button'),
  'src/routes/-lint-probe-ui.tsx': importFrom('#/shared/ui/button', 'Button'),
  'src/lib/lint-probe-zod.ts': importFrom('zod', 'z'),
  'src/routes/-lint-probe-zod.ts': importFrom('zod/v4', 'z'),
  'src/shared/lint-probe-zod.ts': importFrom('zod', 'z'),
  'src/server/qbit/lint-probe-zod.ts': importFrom('zod', 'z'),
  'src/server/sync/lint-probe-qbit-session.ts': importFrom(
    '#/server/qbit/session',
    'createQbitSession',
  ),
  'src/server/functions/lint-probe-qbit-session.ts': importFrom(
    '../qbit/session.ts',
    'createQbitSession',
  ),
  'src/server/sync/lint-probe-qbit-session-export.ts':
    "export { createQbitSession } from '../qbit/session'\n",
}

// Real files linted alongside the probes (read only).
const REAL_FILES = [
  'src/server/qbit/client.ts',
  'src/server/functions/_define.ts',
  'src/server/functions/__fixtures__/sample.ts',
  'src/shared/ui/cn.ts',
  'src/shared/zod.ts',
]

const results = new Map<string, Array<Linter.LintMessage>>()

function ruleIds(file: string): Array<string | null> {
  const messages = results.get(file)
  if (!messages) throw new Error(`no lint result for ${file}`)
  return messages.map((message) => message.ruleId)
}

/**
 * Virtual files are outside the TypeScript project, so rules that need type
 * information are switched off for them. The rules under test need none.
 */
async function untypedOverride(): Promise<Linter.Config> {
  const config = (await new ESLint({ cwd: ROOT }).calculateConfigForFile(
    join(ROOT, 'src/lib/app-error.ts'),
  )) as Linter.Config
  const off: Linter.RulesRecord = {}
  for (const id of Object.keys(config.rules ?? {})) {
    const slash = id.lastIndexOf('/')
    if (slash === -1) continue
    const rule =
      config.plugins?.[id.slice(0, slash)]?.rules?.[id.slice(slash + 1)]
    const docs = rule?.meta?.docs as
      { requiresTypeChecking?: boolean } | undefined
    if (docs?.requiresTypeChecking) off[id] = 'off'
  }
  return {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { project: false, projectService: false },
    },
    rules: off,
  }
}

beforeAll(async () => {
  const probes = new ESLint({
    cwd: ROOT,
    overrideConfig: await untypedOverride(),
  })
  for (const [file, source] of Object.entries(PROBES)) {
    const [result] = await probes.lintText(source, {
      filePath: join(ROOT, file),
    })
    results.set(file, result.messages)
  }
  const real = await new ESLint({ cwd: ROOT }).lintFiles(REAL_FILES)
  for (const result of real) {
    results.set(relative(ROOT, result.filePath), result.messages)
  }
}, 120_000)

describe('layer boundaries', () => {
  it.each([
    ['lib -> state', 'src/lib/lint-probe-to-state.ts'],
    ['lib -> root file (router)', 'src/lib/lint-probe-to-root.ts'],
    ['state -> server', 'src/state/lint-probe-to-server.ts'],
    ['route -> server', 'src/routes/-lint-probe-to-server.ts'],
    [
      'feature -> another feature (relative)',
      'src/features/lint-probe/relative.ts',
    ],
    [
      'feature -> another feature (#/ alias)',
      'src/features/lint-probe/alias.ts',
    ],
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

describe('AD-5 the qBittorrent session only from src/server/qbit', () => {
  it.each([
    [
      '#/ alias from src/server/sync',
      'src/server/sync/lint-probe-qbit-session.ts',
    ],
    [
      'relative path from src/server/functions',
      'src/server/functions/lint-probe-qbit-session.ts',
    ],
    [
      're-export from src/server/sync',
      'src/server/sync/lint-probe-qbit-session-export.ts',
    ],
  ])('blocks %s', (_name, file) => {
    expect(ruleIds(file)).toContain('no-restricted-syntax')
  })

  it('allows it inside src/server/qbit', () => {
    expect(ruleIds('src/server/qbit/client.ts')).not.toContain(
      'no-restricted-syntax',
    )
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
