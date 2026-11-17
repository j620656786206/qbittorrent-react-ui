//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import boundaries from 'eslint-plugin-boundaries'

// Layer map from the architecture spine (design pattern section). An arrow is
// "may import"; every direction not listed here is an error.
const layers = [
  { type: 'route', pattern: 'src/routes' },
  { type: 'feature', pattern: 'src/features/*', capture: ['name'] },
  { type: 'state', pattern: 'src/state' },
  { type: 'lib', pattern: 'src/lib' },
  { type: 'shared', pattern: 'src/shared' },
  // Must stay above `server`: the first matching descriptor wins.
  { type: 'server-functions', pattern: 'src/server/functions' },
  { type: 'server', pattern: 'src/server/*', capture: ['module'] },
]
const LAYER_TYPES = layers.map((layer) => layer.type)

// Top-level `src/*.ts(x)` files (router.tsx, later start.ts) wire the app
// together: they may import any layer, and no layer may import them.
const files = [
  { pattern: 'src/*.{ts,tsx}', category: 'root' },
  { pattern: 'src/**/*.css', category: 'style' },
]

const allow = (from, to) => ({
  from: { element: { type: from } },
  allow: { to: { element: { types: to } } },
})

const layerPolicies = [
  allow('route', [
    'route',
    'feature',
    'state',
    'lib',
    'shared',
    'server-functions',
  ]),
  allow('feature', ['state', 'lib', 'shared', 'server-functions']),
  // A feature may import itself, never another feature.
  {
    from: { element: { type: 'feature' } },
    allow: {
      to: {
        element: {
          type: 'feature',
          captured: { name: '{{ from.element.captured.name }}' },
        },
      },
    },
  },
  allow('state', ['lib', 'shared']),
  allow('server-functions', ['server', 'shared']),
  allow('server', ['server', 'lib', 'shared']),
  allow('lib', ['shared']),
  {
    from: { file: { categories: 'root' } },
    allow: { to: { element: { types: LAYER_TYPES } } },
  },
  // Stylesheets (e.g. `styles.css?url` in __root) are not code.
  { allow: { to: { file: { categories: 'style' } } } },
]

// AD-10: no raw HTML injection. Each ban also matches the computed form
// (`el['innerHTML']`, `document['write']`) and any chain ending in
// `.document.write` (`window.document.write`, `globalThis.document.write`).
const prop = (names) =>
  `:matches([property.name=/^(${names})$/], [property.value=/^(${names})$/])`
const DANGEROUS_HTML =
  'AD-10: dangerouslySetInnerHTML is banned. Render text as plain text.'

const rawHtmlBans = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: DANGEROUS_HTML,
  },
  {
    selector:
      "Property:matches([key.name='dangerouslySetInnerHTML'], [key.value='dangerouslySetInnerHTML'])",
    message: DANGEROUS_HTML,
  },
  {
    selector: `AssignmentExpression > MemberExpression.left${prop('innerHTML|outerHTML')}`,
    message:
      'AD-10: assigning innerHTML / outerHTML is banned. Use textContent.',
  },
  {
    selector: `CallExpression > MemberExpression.callee${prop('write|writeln')}:matches([object.name='document'], [object.property.name='document'], [object.property.value='document'])`,
    message: 'AD-10: document.write / document.writeln is banned.',
  },
  {
    selector: `CallExpression > MemberExpression.callee${prop('insertAdjacentHTML|createContextualFragment|setHTMLUnsafe')}`,
    message:
      'AD-10: insertAdjacentHTML / createContextualFragment / setHTMLUnsafe are banned. Build DOM nodes or use textContent.',
  },
]

// AD-5: only src/server/qbit may use the session (it sends to any QbitPath);
// the rest of the app calls the client's named methods. Relative or `#/`.
// esquery regexes cannot contain `/`, so `.` stands for the separator.
const QBIT_SESSION_SOURCE = String.raw`/(^|[^a-z])qbit.session(\.tsx?)?$/`
const QBIT_SESSION_MESSAGE =
  'AD-5: src/server/qbit/session is for src/server/qbit only. Use the client from #/server/qbit.'
const qbitSessionBans = [
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
].map((node) => ({
  selector: `${node}[source.value=${QBIT_SESSION_SOURCE}]`,
  message: QBIT_SESSION_MESSAGE,
}))

// AR-39: only the maindata query function (through mergeMaindata) writes
// `['maindata']`, and only createQueryClient registers its options. What is
// caught: the key written as MAINDATA_KEY, `[...MAINDATA_KEY]` or an array
// starting with 'maindata', bare or under `as const` / `satisfies`, in
// - `setQueryData` / `setQueriesData` (also `client['setQueryData']`), as the
//   key or as a filter's `queryKey`;
// - any options object with that `queryKey` and a `queryFn` (useQuery,
//   useQueries, useInfiniteQuery, queryOptions, fetchQuery, ...): an override
//   of the registered query function, outside src/state/maindata.ts;
// - `setQueryDefaults` with that key, outside src/state/query-client.ts.
// Not caught: the key through another variable (`const k = MAINDATA_KEY`) or
// direct cache access; those stay review-time rules. AR-35: `refetchInterval`
// only ever takes `pollInterval(...)`, which stops polling while login is
// required.
const SET_DATA = '/^set(Query|Queries)Data$/'
const SET_DATA_CALL = `CallExpression:matches([callee.name=${SET_DATA}], [callee.property.name=${SET_DATA}], [callee.property.value=${SET_DATA}])`
const SET_DEFAULTS = "'setQueryDefaults'"
const SET_DEFAULTS_CALL = `CallExpression:matches([callee.name=${SET_DEFAULTS}], [callee.property.name=${SET_DEFAULTS}], [callee.property.value=${SET_DEFAULTS}])`
const MAINDATA_KEY_NODE = `:matches(Identifier[name='MAINDATA_KEY'], ArrayExpression[elements.0.value='maindata'], ArrayExpression[elements.0.type='SpreadElement'][elements.0.argument.name='MAINDATA_KEY'])`
const TS_WRAPPER = ':matches(TSAsExpression, TSSatisfiesExpression)'
const keyed = (name) =>
  `Property:matches([key.name='${name}'], [key.value='${name}'])`
const MAINDATA_WRITE =
  "AR-39: only mergeMaindata (the ['maindata'] query function) writes ['maindata']. After an operation call refreshMaindata() from src/state/maindata.ts."
const MAINDATA_QUERY_FN =
  "AR-39: ['maindata'] gets its queryFn from createQueryClient({ fetchMaindata }). Read it with useMaindata(select) from src/state/maindata.ts."
const MAINDATA_DEFAULTS =
  "AR-39: only createQueryClient (src/state/query-client.ts) registers ['maindata'] options."
const ban = (message) => (selector) => ({ selector, message })
/** The maindata key as the first child of `parent`, bare or wrapped. */
const keyFirst = (parent) => [
  `${parent} > ${MAINDATA_KEY_NODE}:first-child`,
  `${parent} > ${TS_WRAPPER}:first-child > ${MAINDATA_KEY_NODE}.expression`,
]
const setMaindataBans = [
  ...keyFirst(SET_DATA_CALL),
  `${SET_DATA_CALL} > ObjectExpression:first-child > ${keyed('queryKey')} > ${MAINDATA_KEY_NODE}.value`,
  `${SET_DATA_CALL} > ObjectExpression:first-child > ${keyed('queryKey')} > ${TS_WRAPPER}.value > ${MAINDATA_KEY_NODE}.expression`,
].map(ban(MAINDATA_WRITE))
const setMaindataDefaultsBans = keyFirst(SET_DEFAULTS_CALL).map(
  ban(MAINDATA_DEFAULTS),
)
// esquery's :has cannot follow a child chain (`:has(> A > B)`), so the key
// is matched through attribute paths on the queryKey property instead.
const MAINDATA_KEY_VALUE = [
  "[value.name='MAINDATA_KEY']",
  "[value.elements.0.value='maindata']",
  "[value.elements.0.argument.name='MAINDATA_KEY']",
  "[value.expression.name='MAINDATA_KEY']",
  "[value.expression.elements.0.value='maindata']",
  "[value.expression.elements.0.argument.name='MAINDATA_KEY']",
].join(', ')
const maindataQueryFnBans = [
  `ObjectExpression:has(> ${keyed('queryKey')}:matches(${MAINDATA_KEY_VALUE})):has(> ${keyed('queryFn')})`,
].map(ban(MAINDATA_QUERY_FN))
const refetchIntervalBan = {
  selector: `${keyed('refetchInterval')}:not([value.type='CallExpression'][value.callee.name='pollInterval'])`,
  message:
    'AR-35: refetchInterval must be pollInterval(ms) from src/state/polling.ts (it stops while login is required).',
}
const queryBans = [
  ...setMaindataBans,
  ...maindataQueryFnBans,
  ...setMaindataDefaultsBans,
  refetchIntervalBan,
]

// AR-41, AD-13: screens never read qBittorrent state codes themselves.
// Caught: `x.state` (or `x?.state`) compared, switched on, passed to
// includes / has / indexOf, used as a lookup key or called on
// (`x.state.endsWith()`), and `{ state }` destructured from a value whose
// name says torrent (`const { state } = torrent`, `= data.torrents[h]`) or a
// parameter typed `...Torrent`. Not caught: copying it first
// (`const s = t.state`); a review-time rule. `{ state }` from anything else
// (useLocation(), a sidebar hook) is fine.
const TORRENT_STATE_MESSAGE =
  'AR-41: do not read torrent.state. Use classify() / statusOf() from src/lib/torrent-status.ts.'
const STATE_MEMBER = `MemberExpression:matches([computed=false][property.name='state'], [computed=true][property.value='state'])`
/** `x.state` as the child of `parent`, plain or inside an optional chain. */
const stateAt = (parent, field = '') => [
  `${parent} > ${STATE_MEMBER}${field}`,
  `${parent} > ChainExpression${field} > ${STATE_MEMBER}.expression`,
]
const TORRENTISH = '/torrent/i'
const TORRENT_INIT = [
  `[init.name=${TORRENTISH}]`,
  `[init.property.name=${TORRENTISH}]`,
  `[init.object.name=${TORRENTISH}]`,
  `[init.object.property.name=${TORRENTISH}]`,
].join(', ')
const torrentStateBans = [
  ...stateAt('BinaryExpression[operator=/^[!=]==?$/]'),
  ...stateAt('SwitchStatement', '.discriminant'),
  ...stateAt('CallExpression[callee.property.name=/^(includes|has|indexOf)$/]'),
  ...stateAt('MemberExpression[computed=true]', '.property'),
  `CallExpression > MemberExpression.callee > ${STATE_MEMBER}.object`,
  `VariableDeclarator:matches(${TORRENT_INIT}) > ObjectPattern.id > ${keyed('state')}`,
  `ObjectPattern[typeAnnotation.typeAnnotation.typeName.name=/Torrent$/] > ${keyed('state')}`,
].map(ban(TORRENT_STATE_MESSAGE))

const CREATE_SERVER_FN_BAN = {
  group: ['@tanstack/*start*', '@tanstack/*start*/**'],
  importNames: ['createServerFn'],
  message:
    'AD-5: create server functions with serverGet / serverPost and guard() from src/server/functions/_define.ts.',
}
// Relative or `#/` alias, with or without extension.
const DEFINE_BAN = {
  regex: '(^|/)_define(\\.tsx?)?$',
  message:
    'AD-5: only files under src/server/functions may import the server function factory.',
}
// shadcn's class merger only through src/shared/ui/cn.ts, which knows the
// brand's type, radius and shadow tokens.
const CN_BAN = {
  regex: '^cn(/|$)',
  message: 'Import cn from #/shared/ui/cn, which knows the design tokens.',
}
// UI components belong to screens; server, lib and state never import them.
const SHARED_UI_BAN = {
  regex: '(^|/)shared/ui(/|$)',
  message: 'src/shared/ui is for routes and features only.',
}

// AD-13, story 2.6: features show toasts through src/lib/toast.ts only. The
// renderer and its store (src/shared/ui/toaster.tsx) may be imported by
// that file and the root that mounts <Toaster /> (plus the two test files
// that check the toaster), nowhere else.
// Any specifier ending in `toaster` (`#/shared/ui/toaster`, `./toaster`).
const TOASTER_BAN = {
  regex: '(^|/)toaster(\\.tsx?)?$',
  message:
    'AD-13: show toasts with src/lib/toast.ts; only it and src/routes/__root.tsx import the toaster.',
}
// src/lib/toast.ts may import src/shared/ui/toaster and nothing else there.
const SHARED_UI_BUT_TOASTER_BAN = {
  regex: '(^|/)shared/ui/(?!toaster(\\.tsx?)?$)[^/]+$',
  message: 'src/shared/ui is for routes and features only.',
}
const TOASTER_USERS = [
  'src/lib/toast.ts',
  'src/lib/toast.test.ts',
  'src/routes/__root.tsx',
  'src/shared/ui/toaster.dom.test.tsx',
]

// AD-10: the CSP has no 'unsafe-eval'. zod's eval probe runs at schema
// construction unless jitless is set, so outside src/server every schema
// takes `z` from src/shared/zod.ts, which sets it first.
const ZOD_BAN = {
  regex: '^zod(/|$)',
  message:
    "AD-10: import { z } from '#/shared/zod' (jitless, no CSP eval violation).",
}

// A later flat-config block replaces `no-restricted-imports` for the files it
// matches instead of merging, so the file groups below are disjoint and each
// lists every ban that applies to it.
const restrictImports = (...patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
})
const CN_FILE = 'src/shared/ui/cn.ts'
const DEFINE_FILE = 'src/server/functions/_define.ts'
const SERVER_FUNCTIONS = 'src/server/functions/**'
const SERVER_FUNCTION_NODE_ONLY =
  'src/server/functions/**/{*.test.{ts,tsx},__fixtures__/**}'
const SHARED_UI = 'src/shared/ui/**'
const ZOD_FILE = 'src/shared/zod.ts'
const NO_UI_LAYERS = [
  'src/server/**/*.{ts,tsx}',
  'src/lib/**/*.{ts,tsx}',
  'src/state/**/*.{ts,tsx}',
  'src/shared/**/*.{ts,tsx}',
]

export default [
  {
    ignores: [
      '_bmad/**',
      '_bmad-output/**',
      '.claude/**',
      '.output/**',
      '.nitro/**',
      '.tanstack/**',
      'config/**',
      'src/routeTree.gen.ts',
      'eslint.config.js',
      'prettier.config.js',
      // Plain Node scripts; the TypeScript lint config does not apply.
      'scripts/**',
    ],
  },
  ...tanstackConfig,
  {
    rules: {
      // Import cycles break module init order; keep them out.
      'import/no-cycle': 'error',
      // Import order is style only; the official template turns both off.
      'import/order': 'off',
      'sort-imports': 'off',
      // Both `T[]` and `Array<T>` are fine; the template turns this off.
      '@typescript-eslint/array-type': 'off',
      // Framework hooks (route handlers, server functions) are async by
      // signature even when the body does not await.
      '@typescript-eslint/require-await': 'off',
      // A later block replaces this list for the files it matches instead of
      // merging, so every no-restricted-syntax group repeats what applies.
      'no-restricted-syntax': [
        'error',
        ...rawHtmlBans,
        ...qbitSessionBans,
        ...queryBans,
      ],
    },
  },
  // The qBittorrent session is for src/server/qbit only; everyone else goes
  // through the client's named methods (AD-5).
  {
    files: ['src/server/qbit/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...rawHtmlBans, ...queryBans] },
  },
  // The registered maindata query function lives here (AR-39).
  {
    files: ['src/state/maindata.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...rawHtmlBans,
        ...qbitSessionBans,
        ...setMaindataBans,
        ...setMaindataDefaultsBans,
        refetchIntervalBan,
      ],
    },
  },
  // createQueryClient registers the maindata options here (AR-39).
  {
    files: ['src/state/query-client.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...rawHtmlBans,
        ...qbitSessionBans,
        ...setMaindataBans,
        ...maindataQueryFnBans,
        refetchIntervalBan,
      ],
    },
  },
  // Screens map states only through src/lib/torrent-status.ts (AR-41).
  // src/shared/ui is generic UI (shadcn) that never gets a torrent, and its
  // components have a `state` of their own (sidebar, data-state).
  {
    files: ['src/features/**/*.{ts,tsx}', 'src/routes/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...rawHtmlBans,
        ...qbitSessionBans,
        ...queryBans,
        ...torrentStateBans,
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: { alwaysTryTypes: true },
        node: true,
      },
      'boundaries/root-path': import.meta.dirname,
      'boundaries/legacy-templates': false,
      'boundaries/elements': layers,
      'boundaries/files': files,
      'boundaries/ignore': ['src/routeTree.gen.ts'],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        { default: 'disallow', policies: layerPolicies },
      ],
      // Any file or import target outside the layer map fails lint.
      'boundaries/no-unknown-files': 'error',
      'boundaries/no-unknown-dependencies': 'error',
    },
  },
  // AD-5: every server function comes from the factory in _define.ts, and
  // only files under src/server/functions may use that factory. Plus the cn
  // and src/shared/ui bans above.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [...NO_UI_LAYERS, ...TOASTER_USERS],
    rules: restrictImports(
      CREATE_SERVER_FN_BAN,
      DEFINE_BAN,
      CN_BAN,
      ZOD_BAN,
      TOASTER_BAN,
    ),
  },
  {
    files: ['src/routes/__root.tsx'],
    rules: restrictImports(CREATE_SERVER_FN_BAN, DEFINE_BAN, CN_BAN, ZOD_BAN),
  },
  {
    files: [`${SHARED_UI}/*.{ts,tsx}`],
    ignores: [CN_FILE, ...TOASTER_USERS],
    rules: restrictImports(
      CREATE_SERVER_FN_BAN,
      DEFINE_BAN,
      CN_BAN,
      ZOD_BAN,
      TOASTER_BAN,
    ),
  },
  {
    files: ['src/shared/ui/toaster.dom.test.tsx'],
    rules: restrictImports(CREATE_SERVER_FN_BAN, DEFINE_BAN, CN_BAN, ZOD_BAN),
  },
  {
    files: [CN_FILE],
    rules: restrictImports(CREATE_SERVER_FN_BAN, DEFINE_BAN, ZOD_BAN),
  },
  // src/server never reaches the browser: zod directly is fine there.
  {
    files: ['src/server/**/*.{ts,tsx}'],
    ignores: [SERVER_FUNCTIONS],
    rules: restrictImports(
      CREATE_SERVER_FN_BAN,
      DEFINE_BAN,
      CN_BAN,
      SHARED_UI_BAN,
    ),
  },
  {
    files: [
      'src/lib/**/*.{ts,tsx}',
      'src/state/**/*.{ts,tsx}',
      'src/shared/**/*.{ts,tsx}',
    ],
    ignores: [SHARED_UI, ZOD_FILE, ...TOASTER_USERS],
    rules: restrictImports(
      CREATE_SERVER_FN_BAN,
      DEFINE_BAN,
      CN_BAN,
      SHARED_UI_BAN,
      ZOD_BAN,
    ),
  },
  {
    files: ['src/lib/toast.ts', 'src/lib/toast.test.ts'],
    rules: restrictImports(
      CREATE_SERVER_FN_BAN,
      DEFINE_BAN,
      CN_BAN,
      SHARED_UI_BUT_TOASTER_BAN,
      ZOD_BAN,
    ),
  },
  {
    files: [ZOD_FILE],
    rules: restrictImports(
      CREATE_SERVER_FN_BAN,
      DEFINE_BAN,
      CN_BAN,
      SHARED_UI_BAN,
    ),
  },
  // Routes and features import server function files, so they reach the
  // browser bundle: zod comes from src/shared/zod.ts there (AD-10). Tests
  // and fixtures only run in Node.
  {
    files: [`${SERVER_FUNCTIONS}/*.{ts,tsx}`],
    ignores: [DEFINE_FILE, SERVER_FUNCTION_NODE_ONLY],
    rules: restrictImports(
      CREATE_SERVER_FN_BAN,
      CN_BAN,
      SHARED_UI_BAN,
      ZOD_BAN,
    ),
  },
  {
    files: [SERVER_FUNCTION_NODE_ONLY],
    rules: restrictImports(CREATE_SERVER_FN_BAN, CN_BAN, SHARED_UI_BAN),
  },
  {
    files: [DEFINE_FILE],
    rules: restrictImports(CN_BAN, SHARED_UI_BAN),
  },
  // AD-16: only src/server/log writes logs.
  {
    files: ['src/server/**/*.{ts,tsx}', 'src/start.ts'],
    rules: { 'no-console': 'error' },
  },
]
