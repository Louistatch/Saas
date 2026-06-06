'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

interface ChartCardProps {
  title: string
  description?: string
  icon?: React.ElementType
  isLoading: boolean
  children: React.ReactNode
}

export function ChartCard({ title, description, icon: Icon, isLoading, children }: ChartCardProps) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-foreground text-base font-semibold">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />}
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-2xl tracking-widest select-none">
            — — —
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}
