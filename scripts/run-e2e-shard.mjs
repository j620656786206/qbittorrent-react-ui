// Runs one CI shard of the Playwright suite (scripts/e2e-shards.mjs).
// Usage: node scripts/run-e2e-shard.mjs <shard>   (after `npm run build`)
// Extra arguments go to `playwright test` unchanged.
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { shardFiles } from './e2e-shards.mjs'

const [name, ...extra] = process.argv.slice(2)
if (!name) {
  console.error(
    'usage: node scripts/run-e2e-shard.mjs <shard> [playwright args]',
  )
  process.exit(2)
}

const allSpecs = readdirSync('e2e')
  .filter((file) => file.endsWith('.spec.ts'))
  .sort()
const files = shardFiles(name, allSpecs)
if (files.length === 0) {
  console.error(`e2e shard ${name} has no spec files`)
  process.exit(2)
}

console.log(`e2e shard ${name}: ${files.join(', ')}`)
const child = spawn(
  'npx',
  ['playwright', 'test', ...files.map((file) => join('e2e', file)), ...extra],
  { stdio: 'inherit' },
)
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
