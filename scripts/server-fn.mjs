// Server function plumbing shared by the two smoke scripts: find a built
// function's id, and call it the way Start's client does.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fromCrossJSON, toJSONAsync } from 'seroval'

const SERVER_FN_BASE = '/_serverFn/'

function serverFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return serverFiles(path)
    return /\.m?js$/.test(entry.name) ? [path] : []
  })
}

/**
 * The build id of each named server function. Start's compiler writes
 * `createServerRpc({ id: "<sha256>", name: "<export>", ... })` into the
 * function's server chunk; each name must appear exactly once.
 */
export function serverFnIds(serverDir, names) {
  const found = new Map(names.map((name) => [name, new Set()]))
  const pattern = /\bid:\s*"([0-9a-f]{64})",\s*name:\s*"(\w+)"/g
  let manifestText = ''
  for (const file of serverFiles(serverDir)) {
    const text = readFileSync(file, 'utf8')
    if (text.includes('functionName:')) manifestText += text
    for (const [, id, name] of text.matchAll(pattern)) {
      found.get(name)?.add(id)
    }
  }
  const ids = {}
  for (const [name, set] of found) {
    if (set.size !== 1) {
      throw new Error(
        `built server: expected exactly one server function named ${name}, found ${set.size}`,
      )
    }
    const [id] = set
    if (!manifestText.includes(`"${id}"`)) {
      throw new Error(
        `built server: ${name} id is not in the server fn manifest`,
      )
    }
    ids[name] = id
  }
  return ids
}

/**
 * A server function request the way Start's serverFnFetcher builds it.
 * `origin: null` sends no Origin, like a browser's same-origin GET;
 * `headers` adds or overrides headers.
 */
export async function callServerFn(
  base,
  id,
  { method, data, context, origin = base, cookie, headers: extra = {} },
) {
  const headers = {
    Host: new URL(base).host,
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json',
    'x-tsr-serverFn': 'true',
  }
  if (origin !== null) headers.Origin = origin
  if (cookie) headers.Cookie = cookie
  Object.assign(headers, extra)
  let url = `${base}${SERVER_FN_BASE}${id}`
  let body
  if (data !== undefined || context !== undefined) {
    // `context` is what a client may put in payload.context; Start merges it
    // under the request middleware's context.
    const payload = JSON.stringify(await toJSONAsync({ data, context }))
    if (method === 'GET') url += `?${new URLSearchParams({ payload })}`
    else {
      body = payload
      headers['Content-Type'] = 'application/json'
    }
  }
  const response = await fetch(url, { method, headers, body })
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  const result =
    json !== undefined && response.headers.get('x-tss-serialized')
      ? fromCrossJSON(json, { refs: new Map() }).result
      : json
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    cacheControl: response.headers.get('cache-control'),
    cookies: response.headers.getSetCookie(),
    text,
    result,
  }
}
