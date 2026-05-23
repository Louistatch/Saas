'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MapPin, Package, Eye } from 'lucide-react'
import type { MarketplaceProduct } from '@/hooks/use-marketplace-data'

interface ProductCardProps {
  product: MarketplaceProduct
  onClick?: () => void
}

const CATEGORY_ICONS: Record<string, string> = {
  produit: '🌾',
  service: '🔧',
  intrant: '🧪',
  equipement: '🚜',
  semence: '🌱',
  transformation: '🏭',
}

export function ProductCard({ product, onClick }: ProductCardProps) {
  const hasImage = product.images && product.images.length > 0

  return (
    <Card
      className="group border-border hover:border-primary/30 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden"
      onClick={onClick}
    >
      {/* Image / placeholder */}
      <div className="relative aspect-[4/3] bg-gradient-to-br from-secondary/30 to-secondary/10 overflow-hidden">
        {hasImage ? (
          <img
            src={product.images[0].url}
            alt={product.images[0].alt ?? product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl opacity-60">
              {CATEGORY_ICONS[product.category] ?? '🌿'}
            </span>
          </div>
        )}

        {/* Category badge */}
        <div className="absolute top-2 left-2">
          <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm text-xs">
            {CATEGORY_ICONS[product.category]} {product.category}
          </Badge>
        </div>

        {/* Certification badges */}
        {product.certification.length > 0 && (
          <div className="absolute top-2 right-2 flex gap-1">
            {product.certification.slice(0, 2).map((cert) => (
              <Badge key={cert} className="bg-green-600/90 text-white text-[10px] px-1.5">
                {cert === 'bio' ? '🌿 Bio' : cert}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <CardContent className="p-4 space-y-2">
        {/* Name */}
        <h3 className="font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
          {product.name}
        </h3>

        {/* Description */}
        {product.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {product.description}
          </p>
        )}

        {/* Culture + Location */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {product.culture && (
            <span className="inline-flex items-center gap-1">
              <Package className="h-3 w-3" />
              {product.culture}
            </span>
          )}
          {(product.prefecture_name || product.region_name) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {product.prefecture_name ?? product.region_name}
            </span>
          )}
        </div>

        {/* Price + stats */}
        <div className="flex items-center justify-between pt-1">
          <div>
            {product.price != null ? (
              <span className="text-lg font-bold text-foreground">
                {product.price.toLocaleString('fr-FR')} <span className="text-xs font-normal text-muted-foreground">{product.currency}/{product.unit}</span>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground italic">Prix sur demande</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Eye className="h-3 w-3" />
            {product.views_count}
          </div>
        </div>

        {/* Cooperative */}
        {product.cooperative_name && (
          <p className="text-xs text-primary/80 font-medium truncate">
            {product.cooperative_name}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** Skeleton for loading state */
export function ProductCardSkeleton() {
  return (
    <Card className="border-border overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-secondary/30" />
      <CardContent className="p-4 space-y-3">
        <div className="h-5 bg-secondary/40 rounded w-3/4" />
        <div className="h-4 bg-secondary/30 rounded w-full" />
        <div className="h-4 bg-secondary/30 rounded w-1/2" />
        <div className="flex justify-between items-center pt-1">
          <div className="h-6 bg-secondary/40 rounded w-24" />
          <div className="h-4 bg-secondary/30 rounded w-10" />
        </div>
      </CardContent>
    </Card>
  )
}
