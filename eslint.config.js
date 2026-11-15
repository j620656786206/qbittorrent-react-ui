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
  allow('route', ['route', 'feature', 'state', 'lib', 'shared', 'server-functions']),
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
const DANGEROUS_HTML = 'AD-10: dangerouslySetInnerHTML is banned. Render text as plain text.'

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
    message: 'AD-10: assigning innerHTML / outerHTML is banned. Use textContent.',
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
      'no-restricted-syntax': ['error', ...rawHtmlBans],
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
]
