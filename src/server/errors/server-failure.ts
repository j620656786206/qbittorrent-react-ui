import type { ErrorCode } from '#/shared/errors'

/**
 * Thrown by server modules for a known failure. The factory maps it to
 * `fail(code)`; `message` only goes to the log, never to the client.
 */
export class ServerFailure extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string = code) {
    super(message)
    this.name = 'ServerFailure'
    this.code = code
  }
}
