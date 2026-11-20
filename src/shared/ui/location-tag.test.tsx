import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocationTag } from '#/shared/ui/location-tag'

// Story 5.1: the location tag's two looks (DESIGN location-tag) and the
// rule that purple means media library and nothing else.

const classOf = (html: string) => /class="([^"]*)"/.exec(html)?.[1] ?? ''
const classes = (html: string) => classOf(html).split(/\s+/)

describe('LocationTag', () => {
  it('normal: the outline and text-muted, no purple', () => {
    const html = renderToStaticMarkup(
      <LocationTag label="PT 做種" className="rounded-full px-2 py-px" />,
    )
    expect(classes(html)).toEqual(
      expect.arrayContaining(['border', 'text-text-muted', 'rounded-full']),
    )
    expect(html).not.toContain('media-library')
    expect(html).not.toContain('data-media-library')
    expect(html).toContain('>PT 做種</span>')
    expect(html).toContain('title="PT 做種"')
    expect(html).not.toContain('sr-only')
  })

  it('media library: tint, purple, 600, no visible border; dark drops the tint', () => {
    const html = renderToStaticMarkup(
      <LocationTag
        label="影集媒體庫"
        mediaLibrary
        className="rounded-full px-2 py-px"
      />,
    )
    const list = classes(html)
    expect(list).toEqual(
      expect.arrayContaining([
        'bg-media-library-tint',
        'text-media-library',
        'font-semibold',
        'border-transparent',
        'dark:bg-transparent',
        'rounded-full',
      ]),
    )
    expect(list).not.toContain('text-text-muted')
    expect(html).toContain('data-media-library=""')
    expect(html).toContain('>影集媒體庫</span>')
    expect(html).toContain('title="影集媒體庫"')
    expect(html).toContain('<span class="sr-only">，媒體庫</span>')
  })

  it('a caller colour never beats the media-library look', () => {
    const html = renderToStaticMarkup(
      <LocationTag label="影集" mediaLibrary className="text-text-muted" />,
    )
    expect(classes(html)).not.toContain('text-text-muted')
    expect(classes(html)).toContain('text-media-library')
  })

  it('the name truncates inside the tag; the title keeps it whole', () => {
    const long = '很長的名字'.repeat(10)
    const html = renderToStaticMarkup(<LocationTag label={long} />)
    expect(html).toContain('class="min-w-0 truncate"')
    expect(html).toContain(`title="${long}"`)
  })
})

describe('purple means media library only', () => {
  it('no file in src but the tag and the tokens uses the media-library colours', () => {
    const root = join(import.meta.dirname, '..', '..')
    const hits: Array<string> = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          if (readFileSync(path, 'utf8').includes('media-library')) {
            hits.push(relative(root, path))
          }
        }
      }
    }
    walk(root)
    expect(hits.sort()).toEqual(['shared/ui/location-tag.tsx', 'styles.css'])
  })
})
