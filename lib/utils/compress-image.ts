/**
 * Réduit une photo dans le navigateur avant envoi : 800 px de large au plus,
 * WebP (JPEG si le navigateur ne sait pas encoder le WebP). Une photo de
 * téléphone de 4 Mo tombe ainsi à ~40–80 Ko.
 */
export async function compressImage(file: File, maxWidth = 800, quality = 0.75): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas indisponible')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  const webp = await encode('image/webp')
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await encode('image/jpeg')
  if (!jpeg) throw new Error('compression impossible')
  return jpeg
}
