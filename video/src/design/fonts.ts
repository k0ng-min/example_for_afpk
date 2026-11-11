// 글꼴을 렌더 전에 확실히 불러온다(한글 깨짐·대체 글꼴 방지). 라이선스: public/fonts/FONTS.md
import { continueRender, delayRender, staticFile } from 'remotion'

let started = false

export function loadFonts() {
  if (started || typeof document === 'undefined') return
  started = true
  const handle = delayRender('글꼴 불러오기')
  const faces = [
    new FontFace('Pretendard', `url(${staticFile('fonts/PretendardVariable.woff2')}) format('woff2')`, { weight: '100 900' }),
    new FontFace('Outfit', `url(${staticFile('fonts/OutfitVariable.woff2')}) format('woff2')`, { weight: '100 900' }),
  ]
  Promise.all(faces.map((f) => f.load()))
    .then((loaded) => {
      loaded.forEach((f) => (document.fonts as unknown as { add: (f: FontFace) => void }).add(f))
      continueRender(handle)
    })
    .catch((e) => {
      console.error('글꼴 로드 실패', e)
      continueRender(handle)
    })
}
