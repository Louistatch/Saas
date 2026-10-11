import { CityBuilder } from '@/components/haroolife/city-builder'
import type { Metadata } from 'next'
export const metadata: Metadata = {
  title: 'HarooVille — Jeu de construction de ville',
  description:
    'Construisez et gérez une ville togolaise isométrique, ses habitants, routes et chaînes de production.',
}
export default function HarooVillePage() {
  return <CityBuilder />
}
