import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import { listReturnSearch } from '#/state/settings-return'
import { AutoCollapseSwitch } from '#/features/settings/auto-collapse-switch'
import { CategoryOrderList } from '#/features/settings/category-order-list'

// Story 3.3 (EXPERIENCE 「沿用 App 原本的設定頁」, spine 「沿用舊設定頁」):
// the settings page inside the app shell (the header shows as usual). The
// old page's place and look, rewritten with this app's tokens: a top row
// with a ghost icon back button and the title, then the content centered
// at the list column's width. Exactly two items: the category tab order
// and the board's auto-collapse switch. The back button returns to the
// list URL Alex came from (src/state/settings-return.ts), else `/`, in
// place of the settings page's history entry.
// Old layout: `git show 82551ad^:src/routes/settings.tsx`.
// https://tanstack.com/router/latest/docs/framework/react/guide/navigation

export function SettingsPage() {
  return (
    <section aria-label="設定" className="flex flex-col gap-4 pb-6 lg:gap-5">
      <div className="flex items-center gap-2">
        <Link
          to="/"
          search={listReturnSearch()}
          // Replaces the settings entry, so the phone's Back gesture does
          // not return to the settings page.
          replace
          aria-label="回到列表"
          className="inline-flex size-11 flex-none items-center justify-center rounded-full text-text hover-row lg:size-9"
        >
          <ArrowLeft size={20} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h2 className="text-stat-value">設定</h2>
      </div>
      <div className="mx-auto flex w-full max-w-list-column-max flex-col gap-4">
        <SettingsCard
          title="分類分頁順序"
          description="「全部」固定在第一個，其他用箭頭排。電腦和手機共用這個順序。"
        >
          {(titleId) => <CategoryOrderList labelledBy={titleId} />}
        </SettingsCard>
        <AutoCollapseSwitch />
      </div>
    </section>
  )
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: (titleId: string) => ReactNode
}) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="rounded-panel bg-surface px-4 py-4 shadow-card lg:p-panel-padding"
    >
      <h3 id={titleId} className="text-column-title">
        {title}
      </h3>
      <p className="mt-1 text-meta text-text-muted">{description}</p>
      <div className="mt-3">{children(titleId)}</div>
    </section>
  )
}
