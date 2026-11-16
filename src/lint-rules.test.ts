import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Linter } from 'eslint'

// Guards the layer boundaries, the AD-10 raw-HTML bans, the AD-5
// createServerFn ban, the cn and src/shared/ui bans, the AD-16 no-console
// rule, the AR-39 `['maindata']` write, queryFn and setQueryDefaults bans,
// the AR-35 `refetchInterval` rule, the AR-41 torrent-state ban and the
// AD-10 zod ban (including server function files) in eslint.config.js.
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
  'src/state/lint-probe-set-maindata.ts':
    "declare const client: { setQueryData: (k: unknown, v: unknown) => void }\ndeclare const x: unknown\nclient.setQueryData(['maindata'], x)\n",
  'src/features/lint-probe/set-maindata-bare.ts':
    "declare function setQueryData(k: unknown, v: unknown): void\ndeclare const x: unknown\nsetQueryData(['maindata'], x)\n",
  'src/features/lint-probe/set-maindata-key.ts':
    "import { MAINDATA_KEY } from '#/state/maindata'\n\ndeclare const client: { setQueryData: (k: unknown, v: unknown) => void }\ndeclare const x: unknown\nclient.setQueryData(MAINDATA_KEY, x)\n",
  'src/routes/-lint-probe-set-queries-maindata.ts':
    "declare const client: { setQueriesData: (f: unknown, v: unknown) => void }\ndeclare const x: unknown\nclient.setQueriesData({ queryKey: ['maindata'] }, x)\n",
  'src/features/lint-probe/set-session.ts':
    "declare const client: { setQueryData: (k: unknown, v: unknown) => void }\ndeclare const x: unknown\nclient.setQueryData(['session'], x)\n",
  'src/features/lint-probe/refetch-literal.ts':
    'export const options = { refetchInterval: 5000 }\n',
  'src/features/lint-probe/refetch-poll.ts':
    "import { pollInterval } from '#/state/polling'\n\nexport const options = { refetchInterval: pollInterval(5000) }\n",
  'src/features/lint-probe/torrent-state.ts':
    "declare const torrent: { state: string }\n\nexport const isError = torrent.state === 'error'\n",
  'src/routes/-lint-probe-torrent-state-switch.ts':
    "declare const torrent: { state: string }\n\nexport function word() {\n  switch (torrent.state) {\n    default:\n      return ''\n  }\n}\n",
  'src/lib/lint-probe-torrent-state.ts':
    "declare const torrent: { state: string }\n\nexport const isError = torrent.state === 'error'\n",
  'src/features/lint-probe/raw-html.ts':
    "declare const el: HTMLElement\nel.innerHTML = ''\n",
  'src/routes/-lint-probe-raw-html.ts':
    "declare const el: HTMLElement\nel.innerHTML = ''\n",
  'src/features/lint-probe/qbit-session.ts':
    "import { createQbitSession } from '#/server/qbit/session'\n\nexport const x = createQbitSession\n",
  'src/routes/-lint-probe-qbit-session.ts':
    "import { createQbitSession } from '../server/qbit/session'\n\nexport const x = createQbitSession\n",
  'src/shared/ui/lint-probe-raw-html.tsx':
    "declare const el: HTMLElement\nel.innerHTML = ''\n",
  'src/features/lint-probe/set-maindata-as-const.ts':
    "declare const client: { setQueryData: (k: unknown, v: unknown) => void }\ndeclare const x: unknown\nclient.setQueryData(['maindata'] as const, x)\n",
  'src/features/lint-probe/set-maindata-satisfies.ts':
    "declare const client: { setQueryData: (k: unknown, v: unknown) => void }\ndeclare const x: unknown\nclient.setQueryData(['maindata'] satisfies ReadonlyArray<string>, x)\n",
  'src/features/lint-probe/set-maindata-spread.ts':
    "import { MAINDATA_KEY } from '#/state/maindata'\n\ndeclare const client: { setQueryData: (k: unknown, v: unknown) => void }\ndeclare const x: unknown\nclient.setQueryData([...MAINDATA_KEY], x)\n",
  'src/features/lint-probe/set-maindata-computed.ts':
    "declare const client: { setQueryData: (k: unknown, v: unknown) => void }\ndeclare const x: unknown\nclient['setQueryData'](['maindata'], x)\n",
  'src/features/lint-probe/set-queries-as-const.ts':
    "declare const client: { setQueriesData: (f: unknown, v: unknown) => void }\ndeclare const x: unknown\nclient.setQueriesData({ queryKey: ['maindata'] as const }, x)\n",
  'src/features/lint-probe/use-query-fn.ts':
    "import { MAINDATA_KEY } from '#/state/maindata'\n\ndeclare function useQuery(o: unknown): unknown\nexport const r = useQuery({ queryKey: MAINDATA_KEY, queryFn: () => 1 })\n",
  'src/features/lint-probe/fetch-query-fn.ts':
    "declare const client: { fetchQuery: (o: unknown) => unknown }\nexport const r = client.fetchQuery({ queryKey: ['maindata'], queryFn: () => 1 })\n",
  'src/features/lint-probe/prefetch-query-fn.ts':
    "declare const client: { prefetchQuery: (o: unknown) => unknown }\nexport const r = client.prefetchQuery({ queryKey: ['maindata'] as const, queryFn: () => 1 })\n",
  'src/state/lint-probe-ensure-query-fn.ts':
    "import { MAINDATA_KEY } from '#/state/maindata'\n\ndeclare const client: { ensureQueryData: (o: unknown) => unknown }\nexport const r = client.ensureQueryData({ queryKey: [...MAINDATA_KEY], queryFn: () => 1 })\n",
  'src/features/lint-probe/use-query-select.ts':
    "import { MAINDATA_KEY } from '#/state/maindata'\n\ndeclare function useQuery(o: unknown): unknown\nexport const r = useQuery({ queryKey: MAINDATA_KEY, select: (d: unknown) => d })\n",
  'src/state/maindata.ts':
    "declare const client: { fetchQuery: (o: unknown) => unknown }\nexport const r = client.fetchQuery({ queryKey: ['maindata'], queryFn: () => 1 })\n",
  'src/features/lint-probe/state-optional.ts':
    "declare const torrent: { state: string } | undefined\n\nexport const isError = torrent?.state === 'error'\n",
  'src/features/lint-probe/state-includes.ts':
    "declare const torrent: { state: string } | undefined\n\nexport const isUp = ['uploading', 'stalledUP'].includes(torrent!.state)\n",
  'src/features/lint-probe/state-ends-with.ts':
    "declare const torrent: { state: string } | undefined\n\nexport const isUp = torrent!.state.endsWith('UP')\n",
  'src/features/lint-probe/state-lookup.ts':
    'declare const torrent: { state: string } | undefined\n\ndeclare const LABELS: Record<string, string>\nexport const label = LABELS[torrent!.state]\n',
  'src/features/lint-probe/state-destructure.ts':
    'declare const torrent: { state: string }\n\nconst { state } = torrent\nexport { state }\n',
  'src/shared/ui/lint-probe-state.tsx':
    "declare const sidebar: { state: string }\n\nexport const collapsed = sidebar.state === 'collapsed'\n",
  'src/shared/ui/lint-probe-state-destructure.tsx':
    "declare function useSidebar(): { state: string }\n\nconst { state } = useSidebar()\nexport const collapsed = state === 'collapsed'\n",
  'src/routes/-lint-probe-location-state.ts':
    'declare function useLocation(): { state: unknown }\n\nconst { state } = useLocation()\nexport { state }\n',
  'src/features/lint-probe/state-destructure-record.ts':
    'declare const data: { torrents: Record<string, { state: string }> }\ndeclare const hash: string\n\nconst { state } = data.torrents[hash]\nexport { state }\n',
  'src/features/lint-probe/state-destructure-param.ts':
    'interface SlimTorrent {\n  state: string\n}\n\nexport function word({ state }: SlimTorrent) {\n  return state\n}\n',
  'src/features/lint-probe/query-options-fn.ts':
    "import { MAINDATA_KEY } from '#/state/maindata'\n\ndeclare function queryOptions(o: unknown): unknown\nexport const o = queryOptions({ queryKey: MAINDATA_KEY, queryFn: () => 1 })\n",
  'src/features/lint-probe/use-queries-fn.ts':
    "declare function useQueries(o: unknown): unknown\nexport const r = useQueries({\n  queries: [{ queryKey: ['maindata'], queryFn: () => 1 }],\n})\n",
  'src/features/lint-probe/use-infinite-fn.ts':
    "import { MAINDATA_KEY } from '#/state/maindata'\n\ndeclare function useInfiniteQuery(o: unknown): unknown\nexport const r = useInfiniteQuery({\n  queryKey: [...MAINDATA_KEY],\n  queryFn: () => 1,\n  initialPageParam: 0,\n})\n",
  'src/features/lint-probe/set-defaults.ts':
    "import { MAINDATA_KEY } from '#/state/maindata'\n\ndeclare const client: { setQueryDefaults: (k: unknown, o: unknown) => void }\nclient.setQueryDefaults(MAINDATA_KEY, { staleTime: 0 })\n",
  'src/state/lint-probe-set-defaults.ts':
    "declare const client: { setQueryDefaults: (k: unknown, o: unknown) => void }\nclient.setQueryDefaults(['maindata'] as const, { retry: 3 })\n",
  'src/features/lint-probe/set-defaults-session.ts':
    "declare const client: { setQueryDefaults: (k: unknown, o: unknown) => void }\nclient.setQueryDefaults(['session'], { queryFn: () => 1 })\n",
  'src/state/query-client.ts':
    "import { MAINDATA_KEY, maindataQueryDefaults } from '#/state/maindata'\n\ndeclare const client: { setQueryDefaults: (k: unknown, o: unknown) => void }\ndeclare const f: never\nclient.setQueryDefaults(MAINDATA_KEY, maindataQueryDefaults(f))\n",
  'src/server/functions/lint-probe-zod.ts': importFrom('zod', 'z'),
  'src/server/functions/lint-probe-zod-type.ts':
    "import type { z } from 'zod'\n\nexport type Schema = z.ZodType\n",
  'src/server/functions/lint-probe-zod.test.ts': importFrom('zod', 'z'),
  'src/server/functions/__fixtures__/lint-probe-zod.ts': importFrom('zod', 'z'),
  'src/server/functions/lint-probe-shared-zod.ts': importFrom(
    '#/shared/zod',
    'z',
  ),
  'src/features/lint-probe/state-variable-key.ts':
    'declare const LABELS: Record<string, string>\ndeclare const state: string\n\nexport const label = LABELS[state]\n',
  'src/features/lint-probe/router-state.ts':
    "declare const router: { state: { status: string } }\n\nexport const idle = router.state.status === 'idle'\n",
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

function messagesOf(file: string): Array<Linter.LintMessage> {
  const messages = results.get(file)
  if (!messages) throw new Error(`no lint result for ${file}`)
  return messages.filter((message) => message.ruleId === 'no-restricted-syntax')
}

describe("AR-39 only mergeMaindata writes ['maindata']", () => {
  it.each([
    [
      "client.setQueryData(['maindata'], x)",
      'src/state/lint-probe-set-maindata.ts',
    ],
    [
      "setQueryData(['maindata'], x)",
      'src/features/lint-probe/set-maindata-bare.ts',
    ],
    [
      'setQueryData(MAINDATA_KEY, x)',
      'src/features/lint-probe/set-maindata-key.ts',
    ],
    [
      "setQueriesData({ queryKey: ['maindata'] }, x)",
      'src/routes/-lint-probe-set-queries-maindata.ts',
    ],
  ])('blocks %s', (_form, file) => {
    const hits = messagesOf(file)
    expect(hits).toHaveLength(1)
    expect(hits[0].message).toContain('AR-39')
  })

  it("allows setQueryData(['session'], x)", () => {
    expect(messagesOf('src/features/lint-probe/set-session.ts')).toEqual([])
  })
})

describe('AR-35 refetchInterval only through pollInterval()', () => {
  it('blocks refetchInterval: 5000', () => {
    const hits = messagesOf('src/features/lint-probe/refetch-literal.ts')
    expect(hits).toHaveLength(1)
    expect(hits[0].message).toContain('pollInterval')
  })

  it('allows refetchInterval: pollInterval(5000)', () => {
    expect(messagesOf('src/features/lint-probe/refetch-poll.ts')).toEqual([])
  })
})

describe('AR-41 no torrent.state comparisons in screens', () => {
  it.each([
    [
      "torrent.state === 'error' in a feature",
      'src/features/lint-probe/torrent-state.ts',
    ],
    [
      'switch (torrent.state) in a route',
      'src/routes/-lint-probe-torrent-state-switch.ts',
    ],
  ])('blocks %s', (_name, file) => {
    const hits = messagesOf(file)
    expect(hits).toHaveLength(1)
    expect(hits[0].message).toContain('classify()')
  })

  it.each([
    [
      "torrent.state === 'error' in src/lib",
      'src/lib/lint-probe-torrent-state.ts',
    ],
    [
      "router.state.status === 'idle' in a feature",
      'src/features/lint-probe/router-state.ts',
    ],
  ])('allows %s', (_name, file) => {
    expect(messagesOf(file)).toEqual([])
  })
})

describe('features, routes and src/shared/ui keep the global syntax bans', () => {
  it.each([
    ['raw HTML in a feature', 'src/features/lint-probe/raw-html.ts'],
    ['raw HTML in a route', 'src/routes/-lint-probe-raw-html.ts'],
    ['raw HTML in src/shared/ui', 'src/shared/ui/lint-probe-raw-html.tsx'],
  ])('blocks %s', (_name, file) => {
    expect(messagesOf(file).map((m) => m.message)).toEqual([
      expect.stringContaining('AD-10'),
    ])
  })

  it.each([
    ['a feature', 'src/features/lint-probe/qbit-session.ts'],
    ['a route', 'src/routes/-lint-probe-qbit-session.ts'],
  ])('blocks a qbit/session import from %s', (_name, file) => {
    expect(messagesOf(file).map((m) => m.message)).toEqual([
      expect.stringContaining('AD-5: src/server/qbit/session'),
    ])
  })
})

describe('AR-39 other key and call forms', () => {
  it.each([
    [
      "['maindata'] as const",
      'src/features/lint-probe/set-maindata-as-const.ts',
    ],
    [
      "['maindata'] satisfies ...",
      'src/features/lint-probe/set-maindata-satisfies.ts',
    ],
    ['[...MAINDATA_KEY]', 'src/features/lint-probe/set-maindata-spread.ts'],
    [
      "client['setQueryData'](...)",
      'src/features/lint-probe/set-maindata-computed.ts',
    ],
    [
      "setQueriesData({ queryKey: ['maindata'] as const })",
      'src/features/lint-probe/set-queries-as-const.ts',
    ],
  ])('blocks a write with %s', (_form, file) => {
    expect(messagesOf(file).map((m) => m.message)).toEqual([
      expect.stringContaining('only mergeMaindata'),
    ])
  })

  it.each([
    ['useQuery + MAINDATA_KEY', 'src/features/lint-probe/use-query-fn.ts'],
    ["fetchQuery + ['maindata']", 'src/features/lint-probe/fetch-query-fn.ts'],
    [
      "prefetchQuery + ['maindata'] as const",
      'src/features/lint-probe/prefetch-query-fn.ts',
    ],
    [
      'ensureQueryData + [...MAINDATA_KEY] in src/state',
      'src/state/lint-probe-ensure-query-fn.ts',
    ],
    [
      'queryOptions + MAINDATA_KEY',
      'src/features/lint-probe/query-options-fn.ts',
    ],
    [
      "useQueries + ['maindata'] in queries[]",
      'src/features/lint-probe/use-queries-fn.ts',
    ],
    [
      'useInfiniteQuery + [...MAINDATA_KEY]',
      'src/features/lint-probe/use-infinite-fn.ts',
    ],
  ])('blocks a queryFn override: %s', (_form, file) => {
    expect(messagesOf(file).map((m) => m.message)).toEqual([
      expect.stringContaining('createQueryClient({ fetchMaindata })'),
    ])
  })

  it('allows useQuery({ queryKey: MAINDATA_KEY, select })', () => {
    expect(messagesOf('src/features/lint-probe/use-query-select.ts')).toEqual(
      [],
    )
  })

  it('allows the registered query function in src/state/maindata.ts', () => {
    expect(messagesOf('src/state/maindata.ts')).toEqual([])
  })

  it.each([
    [
      'setQueryDefaults(MAINDATA_KEY) in a feature',
      'src/features/lint-probe/set-defaults.ts',
    ],
    [
      "setQueryDefaults(['maindata'] as const) in src/state",
      'src/state/lint-probe-set-defaults.ts',
    ],
  ])('blocks %s', (_form, file) => {
    expect(messagesOf(file).map((m) => m.message)).toEqual([
      expect.stringContaining('only createQueryClient'),
    ])
  })

  it.each([
    [
      "setQueryDefaults(['session'])",
      'src/features/lint-probe/set-defaults-session.ts',
    ],
    [
      'setQueryDefaults(MAINDATA_KEY) in src/state/query-client.ts',
      'src/state/query-client.ts',
    ],
  ])('allows %s', (_form, file) => {
    expect(messagesOf(file)).toEqual([])
  })
})

describe('AR-41 other torrent.state forms', () => {
  it.each([
    ["torrent?.state === 'error'", 'src/features/lint-probe/state-optional.ts'],
    [
      '[...].includes(torrent.state)',
      'src/features/lint-probe/state-includes.ts',
    ],
    [
      "torrent.state.endsWith('UP')",
      'src/features/lint-probe/state-ends-with.ts',
    ],
    ['LABELS[torrent.state]', 'src/features/lint-probe/state-lookup.ts'],
    [
      'const { state } = torrent',
      'src/features/lint-probe/state-destructure.ts',
    ],
    [
      'const { state } = data.torrents[hash]',
      'src/features/lint-probe/state-destructure-record.ts',
    ],
    [
      'function word({ state }: SlimTorrent)',
      'src/features/lint-probe/state-destructure-param.ts',
    ],
  ])('blocks %s', (_form, file) => {
    expect(messagesOf(file).map((m) => m.message)).toEqual([
      expect.stringContaining('classify()'),
    ])
  })

  it.each([
    [
      "sidebar.state === 'collapsed' in src/shared/ui",
      'src/shared/ui/lint-probe-state.tsx',
    ],
    [
      'const { state } = useSidebar() in src/shared/ui',
      'src/shared/ui/lint-probe-state-destructure.tsx',
    ],
    [
      'const { state } = useLocation() in a route',
      'src/routes/-lint-probe-location-state.ts',
    ],
  ])('allows a state that is not a torrent: %s', (_form, file) => {
    expect(messagesOf(file)).toEqual([])
  })

  it('allows a lookup by a variable that happens to be called state', () => {
    expect(messagesOf('src/features/lint-probe/state-variable-key.ts')).toEqual(
      [],
    )
  })
})

describe('AD-10 zod only through src/shared/zod.ts outside src/server', () => {
  it.each([
    ['src/lib', 'src/lib/lint-probe-zod.ts'],
    ['a route (zod/v4 subpath)', 'src/routes/-lint-probe-zod.ts'],
    ['src/shared', 'src/shared/lint-probe-zod.ts'],
    ['a server function file', 'src/server/functions/lint-probe-zod.ts'],
  ])('blocks importing zod from %s', (_name, file) => {
    expect(ruleIds(file)).toContain('no-restricted-imports')
  })

  it('allows it in src/server and in src/shared/zod.ts', () => {
    expect(ruleIds('src/server/qbit/lint-probe-zod.ts')).not.toContain(
      'no-restricted-imports',
    )
    expect(ruleIds('src/shared/zod.ts')).toEqual([])
  })

  it.each([
    [
      '#/shared/zod in a server function file',
      'src/server/functions/lint-probe-shared-zod.ts',
    ],
    [
      'zod in a server function test',
      'src/server/functions/lint-probe-zod.test.ts',
    ],
    [
      'zod in a server function fixture',
      'src/server/functions/__fixtures__/lint-probe-zod.ts',
    ],
  ])('allows %s', (_name, file) => {
    expect(ruleIds(file)).not.toContain('no-restricted-imports')
  })

  it('reports a type-only zod import in a server function file', () => {
    // Pinned so a change in the core rule's handling is noticed.
    expect(ruleIds('src/server/functions/lint-probe-zod-type.ts')).toContain(
      'no-restricted-imports',
    )
  })
})
