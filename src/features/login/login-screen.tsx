import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { CircleAlert, Eye, EyeOff } from 'lucide-react'
import { isAppError } from '#/lib/app-error'
import { login } from '#/server/functions/login'
import { AlertBar } from '#/shared/ui/alert-bar'
import { Button } from '#/shared/ui/button'
import { Checkbox } from '#/shared/ui/checkbox'
import { Input } from '#/shared/ui/input'
import type { ErrorCode } from '#/shared/errors'
import type { LoginInput } from '#/shared/login'
import { barFor, runBarAction } from '#/lib/connection-alert'
import { callFn } from '#/state/call-fn'
import { clearConnectionErrors } from '#/state/connection'
import { useLoginConnectionAlert } from '#/state/connection-alert'
import { useLoginRequired } from '#/state/login-required'
import { completeLogin } from '#/features/login/complete-login'
import {
  afterSubmitError,
  clearsConnectionCodes,
  decideSubmit,
  screenMessage,
  startSlowHint,
} from '#/features/login/login-form-model'

// S10 login (mockups S10-login-desktop, S10-login-error-desktop,
// S10-login-phone). Phone first; `lg:` is desktop. Every value is from the
// mockups or the UX DESIGN.md (spec 1.4 Design Notes table).

export interface LoginScreenProps {
  /** `?redirect=` from the URL; `safeReturnTo` decides if it is followed. */
  redirect: string | undefined
}

const FIELD_LABEL = 'text-[13px] leading-[1.4] font-semibold'

export function LoginScreen({ redirect }: LoginScreenProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const loginRequired = useLoginRequired()
  const ids = useId()
  const usernameId = `${ids}-username`
  const passwordId = `${ids}-password`
  const messageId = `${ids}-message`
  const formRef = useRef<HTMLFormElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  // Set synchronously on submit, so a second press before the pending
  // re-render cannot send a second attempt toward the global lock.
  const inFlightRef = useRef(false)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [submitError, setSubmitError] = useState<ErrorCode | null>(null)
  // Keys the alert so the same error after a new submit is announced again.
  const [attempt, setAttempt] = useState(0)
  const [slow, setSlow] = useState(false)

  const mutation = useMutation({
    mutationFn: (values: LoginInput) => callFn(login, values),
    // The variables hold the plain password: drop the settled mutation at
    // once instead of keeping it in the MutationCache for 5 minutes.
    gcTime: 0,
    onSuccess: (data) => {
      completeLogin({
        data,
        redirect,
        queryClient,
        navigate: (to) => router.history.replace(to),
      })
    },
    onError: (error) => {
      const code: ErrorCode = isAppError(error) ? error.code : 'qbit_rejected'
      setSubmitError(code)
      if (afterSubmitError(code).wrongCredentials) {
        setPassword('')
        passwordRef.current?.focus()
      }
    },
    onSettled: () => {
      inFlightRef.current = false
    },
  })
  const pending = mutation.isPending

  useEffect(() => {
    if (!pending) return
    return startSlowHint(setSlow)
  }, [pending])

  const message = screenMessage({ submitError, loginRequired })
  // Spec 1.7 rows LA1 to LA3: connection failures show the header's bar.
  const bar = barFor(useLoginConnectionAlert())

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // The button keeps its color while pending (no `disabled`); the guard
    // ignores a second press or Enter, and an empty field is focused instead
    // of spending one of the five attempts.
    const decision = decideSubmit({
      inFlight: inFlightRef.current,
      username,
      password,
    })
    if (decision.action === 'ignore') return
    if (decision.action === 'focus') {
      const ref = decision.field === 'username' ? usernameRef : passwordRef
      ref.current?.focus()
      return
    }
    inFlightRef.current = true
    if (clearsConnectionCodes(decision)) clearConnectionErrors()
    setSubmitError(null)
    setAttempt((n) => n + 1)
    mutation.mutate({ username, password, remember })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background px-4 pt-24 pb-[18px] lg:min-h-[max(100dvh,640px)] lg:items-center lg:justify-center lg:p-6">
      <div className="flex flex-col gap-4 lg:w-[400px] lg:max-w-full">
        {bar && (
          <AlertBar
            text={bar.text}
            detail={bar.detail}
            icon={bar.icon}
            actionLabel={bar.actionLabel}
            onAction={() =>
              runBarAction(bar.action, {
                // Resubmit through onSubmit, so decideSubmit still guards it.
                retry: () => formRef.current?.requestSubmit(),
                reload: () => window.location.reload(),
              })
            }
            // A submit clears the codes and removes the bar: keep focus on
            // the form instead of letting it fall to `body`.
            restoreFocusTo={() => submitRef.current}
          />
        )}
        <main className="flex animate-rise flex-col gap-7 lg:w-[400px] lg:max-w-full lg:gap-6 lg:rounded-panel lg:bg-card lg:px-7 lg:pt-8 lg:pb-7">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-page-title">登入</h1>
            <p className="text-body text-muted-foreground">
              用 qBittorrent 的帳號密碼
            </p>
          </div>

          <form
            ref={formRef}
            noValidate
            onSubmit={onSubmit}
            className="flex flex-col gap-[18px]"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor={usernameId} className={FIELD_LABEL}>
                帳號
              </label>
              <Input
                ref={usernameRef}
                id={usernameId}
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-11 text-[16px] lg:h-10 lg:text-body"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={passwordId} className={FIELD_LABEL}>
                密碼
              </label>
              <div className="relative">
                <Input
                  ref={passwordRef}
                  id={passwordId}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoCapitalize="none"
                  // Shown as text, iOS could autocorrect it, and the wrong
                  // attempt would count toward the global lock.
                  autoCorrect="off"
                  spellCheck={false}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={message?.passwordInvalid ? true : undefined}
                  aria-describedby={message ? messageId : undefined}
                  className="h-11 pr-12 text-[16px] lg:h-10 lg:pr-11 lg:text-body"
                />
                <button
                  type="button"
                  aria-label="顯示密碼"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((shown) => !shown)}
                  className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-full bg-transparent text-muted-foreground lg:top-1 lg:right-1 lg:size-8"
                >
                  {showPassword ? (
                    <EyeOff
                      className="size-[18px]"
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                  ) : (
                    <Eye
                      className="size-[18px]"
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                  )}
                </button>
              </div>
              {message && (
                <p
                  key={`${attempt}:${message.text}`}
                  id={messageId}
                  role="alert"
                  className="mt-0.5 flex items-center gap-1.5 text-[13px] leading-[1.4] font-semibold text-status-error"
                >
                  <CircleAlert
                    className="size-4 shrink-0"
                    strokeWidth={2.4}
                    aria-hidden="true"
                  />
                  {message.text}
                </p>
              )}
            </div>

            <label className="flex min-h-11 items-center gap-2.5 text-[15px] lg:min-h-7 lg:text-body">
              <Checkbox
                name="remember"
                checked={remember}
                onCheckedChange={(checked) => setRemember(checked === true)}
              />
              記住我
            </label>

            <div className="flex flex-col gap-1.5">
              <Button
                ref={submitRef}
                type="submit"
                aria-busy={pending}
                className="h-11 w-full text-[15px] lg:h-10 lg:text-body"
              >
                {pending ? '登入中…' : '登入'}
              </Button>
              {pending && slow && (
                <p role="status" className="text-meta text-muted-foreground">
                  還在等 NAS 回應
                </p>
              )}
            </div>
          </form>
        </main>
      </div>
    </div>
  )
}
