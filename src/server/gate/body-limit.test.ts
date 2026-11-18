import { describe, expect, it } from 'vitest'
import { testSession } from '#/server/auth/testing'
import {
  ANONYMOUS_BODY_LIMIT,
  DEFAULT_BODY_LIMIT,
  HASH_LIST_BODY_LIMIT,
  MAX_REQUEST_BODY,
  bodyLimit,
} from './body-limit'
import { runMiddleware, serverFnRequest } from './testing'

function trackedStream(chunkSize: number, chunks: number) {
  const state = { pulls: 0, cancelled: false }
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (state.pulls === chunks) {
          controller.close()
          return
        }
        state.pulls += 1
        controller.enqueue(new Uint8Array(chunkSize))
      },
      cancel() {
        state.cancelled = true
      },
    },
    { highWaterMark: 0 },
  )
  return { stream, state }
}

async function expectTooLarge(response: Response) {
  expect(response.status).toBe(413)
  expect(await response.json()).toEqual({
    ok: false,
    error: { code: 'invalid_input', message: '送出的資料格式不對' },
  })
}

describe('body limit (AR-27)', () => {
  it('uses 64 KB as default and anonymous ceiling, 400 KB as request ceiling', () => {
    expect(DEFAULT_BODY_LIMIT).toBe(65_536)
    // AD-12 (raised 2026-11-18): the hash-list limit is the ceiling.
    expect(HASH_LIST_BODY_LIMIT).toBe(409_600)
    expect(MAX_REQUEST_BODY).toBe(HASH_LIST_BODY_LIMIT)
    // Never raise this with MAX_REQUEST_BODY: it is what a caller without a
    // session can make the container read and parse.
    expect(ANONYMOUS_BODY_LIMIT).toBe(65_536)
  })

  it('measures a logged-in request against the request ceiling', async () => {
    const request = serverFnRequest({ method: 'POST', body: 'z'.repeat(1000) })
    const { next } = await runMiddleware(bodyLimit, {
      request,
      context: { session: testSession() },
    })
    expect(next).toHaveBeenCalledWith({ context: { bodyBytes: 1000 } })
  })

  it('story 2.6: a logged-in body of exactly 393 216 bytes reaches next', async () => {
    const request = serverFnRequest({
      method: 'POST',
      body: 'z'.repeat(HASH_LIST_BODY_LIMIT),
    })
    const { next } = await runMiddleware(bodyLimit, {
      request,
      context: { session: testSession() },
    })
    expect(next).toHaveBeenCalledWith({
      context: { bodyBytes: HASH_LIST_BODY_LIMIT },
    })
  })

  it('story 2.6: a logged-in body of 393 217 bytes gets 413', async () => {
    const request = serverFnRequest({
      method: 'POST',
      body: 'z'.repeat(HASH_LIST_BODY_LIMIT + 1),
    })
    const { next, response } = await runMiddleware(bodyLimit, {
      request,
      context: { session: testSession() },
    })
    expect(next).not.toHaveBeenCalled()
    await expectTooLarge(response)
  })

  it('treats a session look-alike as anonymous', async () => {
    const request = serverFnRequest({
      method: 'POST',
      body: 'x',
      headers: { 'content-length': String(ANONYMOUS_BODY_LIMIT + 1) },
    })
    const { next, response } = await runMiddleware(bodyLimit, {
      request,
      context: { session: { iat: 1, exp: 9_999_999_999 } },
    })
    expect(next).not.toHaveBeenCalled()
    await expectTooLarge(response)
  })

  it('rejects Content-Length 65537 without reading the body', async () => {
    const { stream, state } = trackedStream(1000, 70)
    const request = serverFnRequest({
      method: 'POST',
      body: stream,
      duplex: 'half',
      headers: { 'content-length': '65537' },
    })
    const { response, next } = await runMiddleware(bodyLimit, { request })
    expect(next).not.toHaveBeenCalled()
    expect(state.pulls).toBe(0)
    await expectTooLarge(response)
  })

  it('rejects a 70 000-byte stream without Content-Length once it passes 65 536', async () => {
    // 70 chunks of 1 000 bytes: the count passes 65 536 at chunk 66.
    const { stream, state } = trackedStream(1000, 70)
    const request = serverFnRequest({
      method: 'POST',
      body: stream,
      duplex: 'half',
    })
    expect(request.headers.get('content-length')).toBeNull()
    const { response, next } = await runMiddleware(bodyLimit, { request })
    expect(next).not.toHaveBeenCalled()
    expect(state.pulls).toBeGreaterThanOrEqual(66)
    expect(state.pulls).toBeLessThan(70)
    expect(state.cancelled).toBe(true)
    await expectTooLarge(response)
  })

  it('answers 413 invalid_input, not a 500, when the stream errors (client abort)', async () => {
    let sent = 0
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (sent === 2) {
            controller.error(new Error('aborted'))
            return
          }
          sent += 1
          controller.enqueue(new Uint8Array(1000))
        },
      },
      { highWaterMark: 0 },
    )
    const request = serverFnRequest({
      method: 'POST',
      body: stream,
      duplex: 'half',
    })
    const { response, next } = await runMiddleware(bodyLimit, { request })
    expect(next).not.toHaveBeenCalled()
    await expectTooLarge(response)
  })

  it('passes a 1 000-byte body with bodyBytes and keeps it readable', async () => {
    const request = serverFnRequest({ method: 'POST', body: 'x'.repeat(1000) })
    const { next } = await runMiddleware(bodyLimit, { request })
    expect(next).toHaveBeenCalledWith({ context: { bodyBytes: 1000 } })
    expect(await request.text()).toBe('x'.repeat(1000))
  })

  it('trusts a Content-Length within the ceiling', async () => {
    const request = serverFnRequest({
      method: 'POST',
      body: 'y'.repeat(500),
      headers: { 'content-length': '500' },
    })
    const { next } = await runMiddleware(bodyLimit, { request })
    expect(next).toHaveBeenCalledWith({ context: { bodyBytes: 500 } })
  })

  it('reports 0 bytes for a GET server fn', async () => {
    const { next } = await runMiddleware(bodyLimit, {
      request: serverFnRequest(),
    })
    expect(next).toHaveBeenCalledWith({ context: { bodyBytes: 0 } })
  })

  it('does not touch page requests', async () => {
    const { next } = await runMiddleware(bodyLimit, {
      request: new Request('http://localhost:3000/'),
      handlerType: 'router',
    })
    expect(next).toHaveBeenCalledWith()
  })
})
