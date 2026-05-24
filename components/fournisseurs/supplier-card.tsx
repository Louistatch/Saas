'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Leaf, MessageCircle, User } from 'lucide-react'
import Link from 'next/link'

export interface SupplierData {
  id: string
  name: string
  village: string | null
  canton: string | null
  prefecture: string | null
  region: string | null
  photo_url: string | null
  cooperative: string | null
  cultures: string[]
  superficie_totale: number
  level?: 'Bronze' | 'Argent' | 'Or'
}

const LEVEL_CONFIG = {
  Or: { icon: '🥇', color: '#FFD700', label: 'Certifié Or' },
  Argent: { icon: '🥈', color: '#A8A9AD', label: 'Certifié Argent' },
  Bronze: { icon: '🥉', color: '#CD7F32', label: 'Bronze' },
}

interface SupplierCardProps {
  supplier: SupplierData
}

export function SupplierCard({ supplier }: SupplierCardProps) {
  const level = supplier.level ?? 'Argent'
  const config = LEVEL_CONFIG[level]
  const locality = [supplier.canton, supplier.prefecture].filter(Boolean).join(', ')

  return (
    <Card className="border-border hover:shadow-md hover:border-primary/20 transition-all duration-200 overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Photo */}
          <div className="shrink-0">
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 bg-secondary/30" style={{ borderColor: config.color }}>
              {supplier.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={supplier.photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground truncate">{supplier.name}</h3>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border"
                style={{
                  borderColor: config.color,
                  color: config.color,
                  backgroundColor: `color-mix(in srgb, ${config.color} 10%, transparent)`,
                }}
                aria-label={config.label}
              >
                {config.icon} {level}
              </span>
            </div>

            {/* Location */}
            {locality && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{locality}</span>
              </div>
            )}

            {/* Cooperative */}
            {supplier.cooperative && (
              <p className="text-xs text-primary/80 font-medium truncate">{supplier.cooperative}</p>
            )}

            {/* Cultures */}
            {supplier.cultures.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {supplier.cultures.slice(0, 4).map((culture) => (
                  <Badge key={culture} variant="secondary" className="text-[10px] gap-1 px-2 py-0.5">
                    <Leaf className="h-2.5 w-2.5" />
                    {culture}
                  </Badge>
                ))}
                {supplier.cultures.length > 4 && (
                  <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                    +{supplier.cultures.length - 4}
                  </Badge>
                )}
              </div>
            )}

            {/* Superficie */}
            {supplier.superficie_totale > 0 && (
              <p className="text-xs text-muted-foreground">
                {supplier.superficie_totale.toFixed(1)} ha cultivés
              </p>
            )}
          </div>

          {/* Action */}
          <div className="shrink-0">
            <Link href={`/fournisseurs/${supplier.id}`}>
              <Button size="sm" variant="outline" className="gap-1.5 border-border text-xs">
                <MessageCircle className="h-3.5 w-3.5" />
                Contacter
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
