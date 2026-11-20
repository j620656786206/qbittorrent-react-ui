// Checks the CI split of the Playwright suite (scripts/e2e-shards.mjs):
// - every spec file in e2e/ runs in exactly one shard (none skipped, none twice);
// - every named file exists (a rename must not leave a stale name behind);
// - the shard list in .github/workflows/ci.yml matches SHARD_NAMES.
// Usage: node scripts/verify-shards.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { NAMED_SHARDS, SHARD_NAMES, shardFiles } from './e2e-shards.mjs'

const allSpecs = readdirSync('e2e')
  .filter((file) => file.endsWith('.spec.ts'))
  .sort()
const problems = []

const named = Object.entries(NAMED_SHARDS).flatMap(([shard, files]) =>
  files.map((file) => ({ shard, file })),
)
for (const { shard, file } of named) {
  if (!allSpecs.includes(file)) {
    problems.push(`shard ${shard} names ${file}, which is not in e2e/`)
  }
}

const runs = new Map(allSpecs.map((file) => [file, []]))
for (const shard of SHARD_NAMES) {
  for (const file of shardFiles(shard, allSpecs)) runs.get(file)?.push(shard)
}
for (const [file, shards] of runs) {
  if (shards.length === 0) problems.push(`${file} runs in no shard`)
  if (shards.length > 1) {
    problems.push(
      `${file} runs in ${shards.length} shards: ${shards.join(', ')}`,
    )
  }
}

// The matrix line is a one-line array on purpose, so a regex can read it.
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')
const match = workflow.match(/^\s*shard:\s*\[([^\]]*)\]/m)
if (!match) {
  problems.push('ci.yml: no one-line `shard: [...]` matrix found')
} else {
  const matrix = match[1]
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  if (matrix.join(',') !== SHARD_NAMES.join(',')) {
    problems.push(
      `ci.yml matrix [${matrix.join(', ')}] differs from scripts/e2e-shards.mjs [${SHARD_NAMES.join(', ')}]`,
    )
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`verify-shards: ${problem}`)
  process.exit(1)
}
for (const shard of SHARD_NAMES) {
  console.log(`${shard}: ${shardFiles(shard, allSpecs).join(', ')}`)
}
console.log(
  `verify-shards: ${allSpecs.length} spec files, each in exactly one shard`,
)
