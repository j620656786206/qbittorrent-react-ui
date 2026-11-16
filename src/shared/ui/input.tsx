import * as React from 'react'
import { cn } from '#/shared/ui/cn'

// shadcn Input restyled to DESIGN text-input: capsule, surface, 1px border,
// 13px; the caller sets the height (36 dialog, 40 login, 44 phone). Keyboard
// focus is the global :focus-visible outline; disabled is the global 50%.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'w-full min-w-0 rounded-full border border-input bg-card px-4 text-body text-foreground transition-[color,border-color] selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground',
        'aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
