import { cn } from '@/lib/utils'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  className?: string
  textClassName?: string
}

const sizes = {
  sm: 'h-6 w-6',
  md: 'h-7 w-7',
  lg: 'h-8 w-8',
  xl: 'h-10 w-10',
}

const textSizes = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-xl',
  xl: 'text-2xl',
}

export function Logo({ size = 'md', showText = true, className, textClassName }: LogoProps) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="FaîtiereHub"
        className={cn(sizes[size], 'object-contain rounded-md')}
      />
      {showText ? (
        <span className={cn('font-bold text-foreground', textSizes[size], textClassName)}>
          FaîtiereHub
        </span>
      ) : null}
    </span>
  )
}
