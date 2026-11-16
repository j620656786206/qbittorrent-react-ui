import { Link } from '@tanstack/react-router'
import {
  CENTER_BLOCK_BUTTON_CLASS,
  CENTER_BLOCK_CLASS,
  CENTER_BLOCK_TEXT_CLASS,
} from '#/shared/ui/center-block'
import { cn } from '#/shared/ui/cn'

// Story 2.0: the page for an unknown URL, in place of the router's English
// default. The list's no-result block (S01/S02) centered on the page
// background, 16px gutters on a phone and a capped width on desktop. No
// header: it also shows to a visitor who is not logged in, and the link
// then goes through the `_authed` guard to the login screen.

export function NotFoundScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-6 text-text">
      <main
        className={cn(CENTER_BLOCK_CLASS, 'min-h-[200px] w-full max-w-[480px]')}
      >
        <h1 className={CENTER_BLOCK_TEXT_CLASS}>找不到這個頁面</h1>
        <Link
          to="/"
          className={cn(CENTER_BLOCK_BUTTON_CLASS, 'inline-flex items-center')}
        >
          回到種子列表
        </Link>
      </main>
    </div>
  )
}
