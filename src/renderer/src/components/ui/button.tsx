import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-sm',
        secondary: 'bg-surface-2 text-foreground hover:bg-surface-3 border border-border',
        outline: 'border border-border bg-transparent hover:bg-surface-2 text-foreground',
        ghost: 'hover:bg-surface-2 text-foreground-secondary hover:text-foreground',
        danger: 'bg-danger text-white hover:opacity-90 shadow-sm',
        success: 'bg-success text-white hover:opacity-90 shadow-sm',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        sm: 'h-7 px-2.5',
        default: 'h-9 px-3.5',
        lg: 'h-10 px-5',
        xl: 'h-12 px-6 text-[15px] font-semibold',
        icon: 'h-8 w-8 p-0',
        iconLg: 'h-10 w-10 p-0'
      }
    },
    defaultVariants: { variant: 'default', size: 'default' }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
)
Button.displayName = 'Button'

export { buttonVariants }
