// ============================================================
// 视频生成 Provider 注册
// ============================================================

import type { VideoProvider } from '../video-types'
import { ZlHubVideoProvider } from './zlhub-video'
import { SophnetVideoProvider } from './sophnet-video'

const videoProviders: Record<string, VideoProvider> = {
  zlhub: new ZlHubVideoProvider(),
  'sophnet-video': new SophnetVideoProvider(),
}

export function getVideoProvider(name: string): VideoProvider | undefined {
  return videoProviders[name]
}
