import { createHash, timingSafeEqual } from 'node:crypto'

// AD-3: the login form is compared with the container's qBittorrent
// credentials here, never forwarded. Both sides are hashed first so the
// buffers have equal length, and both pairs are always compared so the time
// does not tell which field was wrong.

export interface ExpectedCredentials {
  qbitUsername: string
  qbitPassword: string
}

const sha256 = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest()

export function credentialsMatch(
  username: string,
  password: string,
  expected: ExpectedCredentials,
): boolean {
  const usernameOk = timingSafeEqual(
    sha256(username),
    sha256(expected.qbitUsername),
  )
  const passwordOk = timingSafeEqual(
    sha256(password),
    sha256(expected.qbitPassword),
  )
  return usernameOk && passwordOk
}
