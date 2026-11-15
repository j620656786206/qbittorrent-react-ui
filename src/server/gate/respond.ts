import { fail } from '#/shared/errors'
import type { ErrorCode } from '#/shared/errors'

/** A gate rejection in the AD-9 contract shape. Never 401 (AR-18). */
export function failureResponse(code: ErrorCode, status: 403 | 413): Response {
  return Response.json(fail(code), { status })
}
