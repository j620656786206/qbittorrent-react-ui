import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      data-slot="toaster"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          success:
            'group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border',
          error:
            'group-[.toaster]:bg-destructive/10 group-[.toaster]:text-foreground group-[.toaster]:border-destructive/20 dark:group-[.toaster]:bg-destructive/20 dark:group-[.toaster]:border-destructive/30',
          warning:
            'group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border',
          info: 'group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border',
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast } from 'sonner'
export { Toaster as default }
