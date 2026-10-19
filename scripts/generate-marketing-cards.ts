/** Rebuild public, fictitious specimens after a card-engine design change. No DB or secrets. */
import { mkdir, readFile } from 'node:fs/promises'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import sharp from 'sharp'
import { type HarooCardType, renderHarooCardSvg } from '../lib/card-engine/haroo-card'

async function main() {
  await initWasm(await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'))
  const fontBuffers = await Promise.all(
    ['Regular', 'Bold'].map((weight) =>
      readFile(`lib/card-engine/fonts/LiberationSans-${weight}.ttf`),
    ),
  )
  const logo = `data:image/png;base64,${(await readFile('public/logo.png')).toString('base64')}`
  await mkdir('public/images/cards', { recursive: true })

  for (const [type, prefix] of Object.entries({
    OUVRIER: 'OUV',
    ACHETEUR: 'ACH',
    AGRONOME: 'AGR',
    OPERATEUR: 'OPE',
  })) {
    const svg = renderHarooCardSvg(
      {
        type: type as HarooCardType,
        firstName: 'Prénom',
        lastName: 'NOM',
        cardNumber: `${prefix}-000000`,
        statusLabel: 'SPÉCIMEN',
      },
      null,
      logo,
    )
    const png = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1180 },
      font: { fontBuffers, defaultFontFamily: 'Liberation Sans', loadSystemFonts: false },
    })
      .render()
      .asPng()
    const file = `public/images/cards/haroo-${type.toLowerCase()}.webp`
    const result = await sharp(png).webp({ quality: 85, effort: 5 }).toFile(file)
    console.log(`${file}: ${result.width}×${result.height}, ${result.size} bytes`)
  }
}

main().catch(() => {
  console.error('Impossible de générer les spécimens publics')
  process.exitCode = 1
})
