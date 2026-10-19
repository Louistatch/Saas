import acheteur from '@/public/images/cards/haroo-acheteur.webp'
import agronome from '@/public/images/cards/haroo-agronome.webp'
import operateur from '@/public/images/cards/haroo-operateur.webp'
import ouvrier from '@/public/images/cards/haroo-ouvrier.webp'
import Image from 'next/image'

const specimens = { OUVRIER: ouvrier, ACHETEUR: acheteur, AGRONOME: agronome, OPERATEUR: operateur }

export function HarooCardSpecimen({
  type,
  alt,
  className,
}: { type: string; alt: string; className?: string }) {
  if (!Object.hasOwn(specimens, type)) return null
  return (
    <Image
      src={specimens[type as keyof typeof specimens]}
      alt={alt}
      loading="lazy"
      decoding="async"
      placeholder="blur"
      quality={85}
      sizes="(max-width: 639px) calc(100vw - 64px), (max-width: 1023px) 512px, 380px"
      className={className}
    />
  )
}
