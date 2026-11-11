import { Config } from '@remotion/cli/config'

// 1920×1080 · 30fps · H.264 (Composition 에서 크기·fps 지정)
Config.setVideoImageFormat('jpeg')
Config.setJpegQuality(92)
Config.setOverwriteOutput(true)
// 디스크 여유가 적은 환경을 고려해 동시 렌더 탭 수를 제한
Config.setConcurrency(4)
