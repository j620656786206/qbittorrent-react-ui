// `npm audit --omit=dev --audit-level=high`, with a short list of advisories
// skipped on purpose. Each skip names the advisory, why it is safe here and
// the day it expires; after that day the audit fails again until someone
// looks at it. Any other high or critical advisory fails as before.
//
// Alex chose this on 2026-11-18 (option A): GHSA-fc5q-39xc-vjpf has no fixed
// picomatch release yet and blocked every PR. Remove the entry as soon as a
// fixed version exists (the script prints a note when the advisory no
// longer shows up).
//
// Usage: node scripts/audit.mjs
// npm audit JSON (report version 2):
// https://docs.npmjs.com/cli/v11/commands/npm-audit#json

import { execFileSync } from 'node:child_process'

const SKIPPED = [
  {
    id: 'GHSA-fc5q-39xc-vjpf',
    expires: '2026-12-31',
    why: 'picomatch ReDoS (<= 4.0.7, no fixed release on 2026-11-18); only build tooling uses it (vite, the TanStack router plugin), and the built .output that runs in the container does not contain it.',
  },
]

const FAILING = new Set(['high', 'critical'])

function readReport() {
  try {
    return execFileSync('npm', ['audit', '--omit=dev', '--json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    // npm audit exits 1 when it finds anything; the JSON is still on stdout.
    if (typeof error.stdout === 'string' && error.stdout.trim() !== '') {
      return error.stdout
    }
    throw error
  }
}

const report = JSON.parse(readReport())
if (report.auditReportVersion !== 2) {
  console.error(
    `unexpected npm audit report version: ${report.auditReportVersion}`,
  )
  process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)
const idOf = (url) => (typeof url === 'string' ? url.split('/').pop() : '')

/** Every advisory npm reports, once each. */
const advisories = new Map()
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via ?? []) {
    if (typeof via !== 'object' || via === null) continue
    advisories.set(via.url ?? String(via.source), via)
  }
}

let failed = false
const seen = new Set()
for (const advisory of advisories.values()) {
  if (!FAILING.has(advisory.severity)) continue
  const id = idOf(advisory.url)
  const skip = SKIPPED.find((entry) => entry.id === id)
  if (skip && today <= skip.expires) {
    seen.add(id)
    console.log(
      `skipped ${id} (${advisory.name}) until ${skip.expires}: ${skip.why}`,
    )
    continue
  }
  failed = true
  const note = skip ? ` (its skip expired on ${skip.expires})` : ''
  console.error(
    `${advisory.severity}: ${advisory.name} ${advisory.range ?? ''} ${advisory.url ?? ''}${note}`,
  )
}

for (const entry of SKIPPED) {
  if (!seen.has(entry.id) && today <= entry.expires) {
    console.log(
      `note: ${entry.id} no longer shows up; remove its skip from scripts/audit.mjs`,
    )
  }
}

if (failed) {
  console.error('npm audit: high or critical advisories found')
  process.exit(1)
}
console.log(
  'npm audit: no high or critical advisories (besides the skips above)',
)
