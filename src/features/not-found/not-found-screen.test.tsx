import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CENTER_BLOCK_BUTTON_CLASS,
  CENTER_BLOCK_CLASS,
  CENTER_BLOCK_TEXT_CLASS,
} from '#/shared/ui/center-block'
import { NotFoundScreen } from '#/features/not-found/not-found-screen'

// Story 2.0 row P7 (unit part): the Chinese not-found block. The router
// hook-up and the click are checked in the browser smoke.

async function render(): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: NotFoundScreen }),
    history: createMemoryHistory({ initialEntries: ['/no-such-page'] }),
  })
  await router.load()
  return renderToStaticMarkup(<RouterProvider router={router} />)
}

const classesOf = (html: string, tag: string) =>
  new RegExp(`<${tag}[^>]* class="([^"]*)"`).exec(html)?.[1].split(' ') ?? []

describe('NotFoundScreen', () => {
  it('shows the heading and a link back to the list', async () => {
    const html = await render()
    expect(html).toMatch(/<h1 [^>]*>找不到這個頁面<\/h1>/)
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>回到種子列表<\/a>/)
  })

  it('reuses the centered block, its text and its outline button', async () => {
    const html = await render()
    const main = classesOf(html, 'main')
    for (const name of CENTER_BLOCK_CLASS.split(' ')) {
      expect(main, name).toContain(name)
    }
    expect(classesOf(html, 'h1')).toEqual(CENTER_BLOCK_TEXT_CLASS.split(' '))
    const link = classesOf(html, 'a')
    for (const name of CENTER_BLOCK_BUTTON_CLASS.split(' ')) {
      expect(link, name).toContain(name)
    }
    // An anchor is inline: without this the 44px height would not apply.
    expect(link).toContain('inline-flex')
    expect(link).not.toContain('flex')
  })
})
