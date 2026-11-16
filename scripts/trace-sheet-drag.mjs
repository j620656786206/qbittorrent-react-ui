// Story 2.2: does dragging the bottom sheet cause layout? Local only, never
// in CI. Starts scripts/fake-qbit.mjs (fake data only, AD-15) on its own
// port, opens the phone sort sheet in headless Chromium at 390px, records a
// Chrome trace (devtools.timeline) while the mouse drags the sheet's handle
// down in small steps, and prints how many Layout and UpdateLayoutTree
// events happened during the drag frames; it exits 1 when any Layout or
// Paint happened. The trace stops before the release, so the snap's
// one-time padding change is not counted.
//
// Usage: npm run build && node scripts/trace-sheet-drag.mjs [--keep trace.json]

import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const PORT = 3290
const BASE = `http://localhost:${PORT}`
const STEPS = 40
const DISTANCE = 160

const keepIndex = process.argv.indexOf('--keep')
const keepPath = keepIndex === -1 ? null : process.argv[keepIndex + 1]

async function waitForHealth() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(`${BASE}/healthz`)
      if (response.ok) return
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('fake-qbit did not start')
}

const server = spawn(
  process.execPath,
  ['scripts/fake-qbit.mjs', '--port', String(PORT)],
  { stdio: 'ignore' },
)

let browser
try {
  await waitForHealth()
  browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    baseURL: BASE,
  })
  await page.goto('/login')
  await page.getByLabel('帳號').fill('fake-user')
  await page.getByLabel('密碼', { exact: true }).fill('fake-pass')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE}/`)
  await page.getByRole('listitem').first().waitFor()

  await page
    .getByRole('button', { name: /^排序：.*，列表$/ })
    .filter({ visible: true })
    .click()
  const sheet = page.getByRole('dialog', { name: '排序' })
  await sheet.waitFor()
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  )
  const top = await sheet.evaluate(
    (element) => element.getBoundingClientRect().top,
  )

  await page.mouse.move(195, top + 10)
  await page.mouse.down()
  // The first move decides the drag (reads the scroll position once and
  // turns on `select-none`, one repaint); let that commit and paint first.
  await page.mouse.move(195, top + 20)
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  )
  await browser.startTracing(page, { categories: ['devtools.timeline'] })
  for (let i = 1; i <= STEPS; i += 1) {
    await page.mouse.move(195, top + 20 + (DISTANCE * i) / STEPS)
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(resolve)),
    )
  }
  const buffer = await browser.stopTracing()
  await page.mouse.up()

  if (keepPath) writeFileSync(keepPath, buffer)
  const { traceEvents } = JSON.parse(buffer.toString('utf8'))
  const count = (name) =>
    traceEvents.filter((event) => event.name === name && event.ph !== 'E')
      .length
  const moves = traceEvents.filter(
    (event) =>
      event.name === 'EventDispatch' &&
      event.args?.data?.type === 'pointermove',
  ).length
  const transform = await sheet.evaluate((element) => element.style.transform)
  const layout = count('Layout')
  const paint = count('Paint')
  // The drag must stay on the compositor: any layout or paint fails the run.
  if (layout > 0 || paint > 0) process.exitCode = 1
  console.log(
    JSON.stringify(
      {
        steps: STEPS,
        pointermoveDispatched: moves,
        layout,
        updateLayoutTree: count('UpdateLayoutTree'),
        paint,
        sheetTransformAtEnd: transform,
      },
      null,
      2,
    ),
  )
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
