import * as React from 'react'
import { Check } from 'lucide-react'
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import { cn } from '#/shared/ui/cn'

// shadcn DropdownMenu (https://ui.shadcn.com/docs/components/dropdown-menu)
// restyled to DESIGN sort-menu: `surface` panel, `card` radius, the float
// shadow, 36px rows with the `row` radius and a `surface-muted` highlight.
// Non-modal by default: a modal Radix menu locks scrolling through
// react-remove-scroll, which injects a `<style>` element the CSP blocks
// (AD-10, no 'unsafe-inline'). Radix docs:
// https://www.radix-ui.com/primitives/docs/components/dropdown-menu
// Keyboard focus is the global :focus-visible outline.

function DropdownMenu({
  modal = false,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return (
    <DropdownMenuPrimitive.Root
      data-slot="dropdown-menu"
      modal={modal}
      {...props}
    />
  )
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 flex max-h-[min(70vh,var(--radix-dropdown-menu-content-available-height))] flex-col overflow-y-auto rounded-card border bg-surface p-1.5 text-text shadow-float',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

const ITEM_CLASS =
  'flex h-9 w-full flex-none cursor-pointer items-center gap-2 rounded-row pr-3 pl-2 text-left select-none data-highlighted:bg-surface-muted'

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(ITEM_CLASS, className)}
      {...props}
    />
  )
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

/** The check sits in a 16px slot on the left, kept empty when unchecked. */
function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(ITEM_CLASS, className)}
      {...props}
    >
      <span className="flex size-4 flex-none items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check size={16} strokeWidth={2.6} aria-hidden="true" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn('px-2 pt-2 pb-1 text-tag text-text-muted', className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('mx-1 my-1.5 h-px flex-none bg-border', className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
}
