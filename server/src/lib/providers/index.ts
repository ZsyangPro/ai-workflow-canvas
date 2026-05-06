import type { ImageProvider } from './types'
import { SophnetProvider } from './sophnet'
import { SeedreamProvider } from './seedream'
import { SophnetGeminiProvider } from './sophnet-gemini'
import { GptImageProvider } from './gpt-image'

const providers: Record<string, ImageProvider> = {
  sophnet: new SophnetProvider(),
  seedream: new SeedreamProvider(),
  'sophnet-gemini': new SophnetGeminiProvider(),
  'gpt-image': new GptImageProvider(),
}

export function getProvider(name: string): ImageProvider | undefined {
  return providers[name]
}
