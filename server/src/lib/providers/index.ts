import type { ImageProvider } from './types'
import { SophnetProvider } from './sophnet'
import { SeedreamProvider } from './seedream'

const providers: Record<string, ImageProvider> = {
  sophnet: new SophnetProvider(),
  seedream: new SeedreamProvider(),
}

export function getProvider(name: string): ImageProvider | undefined {
  return providers[name]
}
