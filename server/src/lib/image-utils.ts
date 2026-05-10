import sharp from 'sharp'

const MAX_BINARY_BYTES = 5 * 1024 * 1024  // 5MB
const MAX_DIMENSION = 3072

/**
 * Compress image if it exceeds size/dimension limits. Returns the original
 * buffer if already within limits, otherwise a compressed JPEG buffer.
 */
export async function compressImageIfNeeded(
  buffer: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const metadata = await sharp(buffer).metadata()
  const { width, height } = metadata
  const withinSize = buffer.length <= MAX_BINARY_BYTES
  const withinDim = width && height && width <= MAX_DIMENSION && height <= MAX_DIMENSION

  if (withinSize && withinDim) {
    return { buffer, mimeType } // already optimal
  }

  let pipeline = sharp(buffer)

  if (width && height) {
    const maxDim = Math.max(width, height)
    if (maxDim > MAX_DIMENSION) {
      pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
    }
  }

  const compressed = await pipeline.jpeg({ quality: 80 }).toBuffer()

  return { buffer: compressed, mimeType: 'image/jpeg' }
}
