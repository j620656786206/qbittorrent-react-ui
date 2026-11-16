import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REQUIRED_ENV } from '#/server/env'

// Spec 1.9: static guards for the image, CI, Dependabot and Unraid files
// (AR-8, AR-9, AR-13, AR-14, AR-16, rows I6 and I7, and the Story 1.2
// TSS_PRERENDERING item). Plain regexes, no YAML or XML parser. The image
// smoke (scripts/smoke-image.mjs) checks the built image's behavior.

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

/** Dockerfile without comments, continuation lines joined. */
function dockerfile(): string {
  return read('Dockerfile')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
    .replace(/\\\n\s*/g, ' ')
}

const WORKFLOW_DIR = '.github/workflows'
function workflows(): Record<string, string> {
  return Object.fromEntries(
    readdirSync(join(ROOT, WORKFLOW_DIR))
      .filter((file) => /\.ya?ml$/.test(file))
      .map((file) => [file, read(join(WORKFLOW_DIR, file))]),
  )
}

/** Lines of the top-level `key:` block, trimmed, without comments. */
function topLevelBlock(text: string, key: string): Array<string> | null {
  const lines = text.split('\n')
  const start = lines.indexOf(`${key}:`)
  if (start === -1) return null
  const block: Array<string> = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    if (!line.startsWith(' ')) break
    block.push(line.trim())
  }
  return block
}

type Attrs = Record<string, string>
const TEMPLATE_PATH = 'deploy/unraid/react-torrent.xml'

function templateConfigs(xml: string): Array<Attrs> {
  return [...xml.matchAll(/<Config\s([^>]*?)\/?>/g)].map(([, attrs]) =>
    Object.fromEntries(
      [...attrs.matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [
        key,
        value,
      ]),
    ),
  )
}

function element(xml: string, name: string): string | null {
  const match = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)
  return match ? match[1] : null
}

describe('deploy files', () => {
  it('(a) Dockerfile: pinned bases, npm ci, non-root, node healthcheck, .output only', () => {
    const text = dockerfile()
    const froms = [...text.matchAll(/^FROM\s+(\S+)/gm)].map(([, ref]) => ref)
    expect(froms.length).toBeGreaterThanOrEqual(2)
    // Dependabot bumps the base image; its Node major must stay on .nvmrc.
    const nvmrc = read('.nvmrc').trim()
    for (const ref of froms) {
      expect(ref).toMatch(/^node:\d+\.\d+\.\d+-[a-z0-9-]+@sha256:[0-9a-f]{64}$/)
      expect(/^node:(\d+)\./.exec(ref)?.[1], ref).toBe(nvmrc)
    }
    expect(text).toMatch(/^RUN npm ci$/m)
    expect(text).toMatch(/^USER 99:100$/m)
    expect(text).toMatch(/^ARG COMMIT_SHA\b/m)
    const healthcheck = /^HEALTHCHECK .*$/m.exec(text)?.[0] ?? ''
    expect(healthcheck).toMatch(/CMD \["node",/)
    expect(healthcheck).toContain('/healthz')

    const lastStage = text.split(/^FROM\s/m).pop() ?? ''
    const copies = lastStage.match(/^(COPY|ADD)\s.*$/gm) ?? []
    expect(copies).toEqual(['COPY --from=build /app/.output /app/.output'])

    expect(read('Dockerfile')).not.toContain('TSS_')
    expect(text).not.toMatch(/^VOLUME\b/m)
  })

  it('(b) .dockerignore: secrets and build leftovers stay out of the context', () => {
    const entries = new Set(
      read('.dockerignore')
        .split('\n')
        .map((line) => line.trim()),
    )
    for (const entry of [
      '**/.env*',
      '!.env.example',
      '.git',
      '**/node_modules',
      '_bmad-output',
      '_bmad',
      '.claude',
      'config',
      '.output',
      '.nitro',
      '.tanstack',
      'coverage',
      '.auto-claude',
      '.wrangler',
      '**/.DS_Store',
    ]) {
      expect(entries, entry).toContain(entry)
    }
  })

  it('(c) workflows: read-only by default, pinned actions, push only from main', () => {
    const files = workflows()
    expect(Object.keys(files)).toContain('ci.yml')
    expect(Object.keys(files)).toContain('image.yml')

    for (const [name, text] of Object.entries(files)) {
      expect(topLevelBlock(text, 'permissions'), name).toEqual([
        'contents: read',
      ])
      expect(text, name).not.toContain('pull_request_target')
      for (const [line] of text.matchAll(/^\s*-?\s*uses:.*$/gm)) {
        expect(line, name).toMatch(/uses: [^@\s]+@[0-9a-f]{40} # v\S+$/)
      }
    }

    const writes = Object.entries(files).flatMap(([name, text]) =>
      (text.match(/packages: write/g) ?? []).map(() => name),
    )
    expect(writes).toEqual(['image.yml'])

    const image = files['image.yml']
    expect(topLevelBlock(image, 'on')).toEqual(['push:', 'branches: [main]'])
    expect(image).toContain('--platform linux/amd64')
    const smoke = image.indexOf('node scripts/smoke-image.mjs')
    const login = image.indexOf('docker/login-action@')
    const push = image.indexOf('docker push')
    expect(smoke).toBeGreaterThan(-1)
    expect(login).toBeGreaterThan(smoke)
    expect(push).toBeGreaterThan(login)

    const ci = files['ci.yml']
    expect(topLevelBlock(ci, 'on')).toEqual([
      'pull_request:',
      'branches: [main]',
    ])
    expect(ci).not.toContain('packages')
    expect(ci).not.toMatch(/docker (push|login)|login-action/)
    expect(ci).toContain('--platform linux/amd64')
    expect(ci).toContain('node scripts/smoke-image.mjs')
    // Story 2.0: the browser smoke runs after the build and the built-server
    // smoke, and its screenshots are uploaded even when it fails.
    const build = ci.indexOf('npm run build')
    const builtSmoke = ci.indexOf('npm run smoke\n')
    const install = ci.indexOf('npx playwright install --with-deps chromium')
    const browserSmoke = ci.indexOf('npm run smoke:browser')
    expect(build).toBeGreaterThan(-1)
    expect(builtSmoke).toBeGreaterThan(build)
    expect(install).toBeGreaterThan(builtSmoke)
    expect(browserSmoke).toBeGreaterThan(install)
    const afterBrowserSmoke = ci.slice(browserSmoke)
    expect(afterBrowserSmoke).toMatch(
      /uses: actions\/upload-artifact@[0-9a-f]{40} # v\S+\n\s+if: always\(\)/,
    )
    expect(afterBrowserSmoke).toContain('e2e-output/screenshots/')
    expect(afterBrowserSmoke).toContain('playwright-report/')
  })

  it('(d) dependabot: three monthly groups, default branch names', () => {
    const text = read('.github/dependabot.yml')
    const [head, updates = ''] = text.split(/^updates:$/m)
    const multi = topLevelBlock(head, 'multi-ecosystem-groups') ?? []
    expect(multi).toEqual(['ci-and-image:', 'schedule:', 'interval: monthly'])

    const entries = updates.split(/^ {2}- /m).slice(1)
    const ecosystem = (name: string) =>
      entries.find((entry) => entry.startsWith(`package-ecosystem: ${name}\n`))
    const npm = ecosystem('npm') ?? ''
    expect(npm).toMatch(/schedule:\n\s+interval: monthly/)
    expect(npm).toMatch(
      /production-dependencies:\n\s+dependency-type: production\n\s+patterns: \['\*'\]\n\s+update-types: \['minor', 'patch'\]/,
    )
    expect(npm).toMatch(
      /development-dependencies:\n\s+dependency-type: development\n\s+patterns: \['\*'\]\n\s+update-types: \['minor', 'patch'\]/,
    )
    for (const name of ['github-actions', 'docker']) {
      const entry = ecosystem(name) ?? ''
      expect(entry, name).toContain('multi-ecosystem-group: ci-and-image')
      expect(entry, name).toContain("patterns: ['*']")
    }

    expect(text).not.toContain('target-branch')
    expect(text).not.toContain('pull-request-branch-name')
  })

  it('(e) Unraid template: required env, two masks, one port, only /config, hardened', () => {
    const xml = read(TEMPLATE_PATH)
    const configs = templateConfigs(xml)

    const variables = configs.filter((config) => config.Type === 'Variable')
    expect(variables.map((config) => config.Target).sort()).toEqual(
      [...REQUIRED_ENV].sort(),
    )
    for (const config of variables) {
      expect(config.Default, config.Target).toBe('')
      expect(config.Required, config.Target).toBe('true')
      expect(config.Display, config.Target).toBe('always')
    }
    expect(
      configs
        .filter((config) => config.Mask === 'true')
        .map((config) => config.Target)
        .sort(),
    ).toEqual(['QBIT_PASSWORD', 'SESSION_SECRET'])

    const ports = configs.filter((config) => config.Type === 'Port')
    expect(ports.map((config) => config.Target)).toEqual(['3000'])
    const paths = configs.filter((config) => config.Type === 'Path')
    expect(paths.map((config) => config.Target)).toEqual(['/config'])
    expect(configs.length).toBe(variables.length + 2)

    expect(element(xml, 'Privileged')).toBe('false')
    expect(element(xml, 'Network')).toBe('bridge')
    expect(element(xml, 'ExtraParams')).toBe(
      '--cap-drop=ALL --security-opt=no-new-privileges --read-only --tmpfs /tmp',
    )
    for (const banned of [
      'docker.sock',
      '--privileged',
      '--network',
      '--net=',
      '-v ',
      '--mount',
      '--device',
      '--cap-add',
      'TSS_',
    ]) {
      expect(xml, banned).not.toContain(banned)
    }
    expect(xml).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/)
  })
})
