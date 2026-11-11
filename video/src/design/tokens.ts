// 영상 디자인 토큰. 최종 제출 사이트와 같은 모던 블랙 & 화이트(밝은 바탕 + 검은 강조).
// 색은 의미 전달용(초록 버팀·앰버 부족·코랄 위험·보라 AI)과 전략 구분에만 쓴다. 주제가 바뀌어도 유지된다.
export const C = {
  bg: '#F6F6F7',
  grid: 'rgba(0, 0, 0, 0.035)',
  gridMajor: 'rgba(0, 0, 0, 0.06)',
  card: '#FFFFFF',
  cardLine: 'rgba(0, 0, 0, 0.07)',
  text: '#18181B',
  ink: '#0E0E10',
  muted: '#52525B',
  dim: '#8A8A93',
  hair: 'rgba(0, 0, 0, 0.08)',
  rowHover: '#F2F2F4',
  accent: '#111113',
  accentSoft: '#EFEFF1',
  ok: '#2E8770',
  okSoft: '#E6F4EF',
  warn: '#A8761F',
  warnSoft: '#FBF3E2',
  danger: '#C9644E',
  dangerSoft: '#FCEFEB',
  violet: '#5D4A9A',
  violetSoft: '#F0EDF9',
  /** 전략 A·B·C·D (웹앱과 동일) */
  series: ['#18181B', '#3D7CC9', '#D07A1F', '#2E9265'],
} as const

export const SHADOW = {
  card: '0 1px 2px rgba(0, 0, 0, 0.04), 0 18px 40px -18px rgba(0, 0, 0, 0.22)',
  pill: '0 1px 2px rgba(0, 0, 0, 0.05), 0 10px 24px -12px rgba(0, 0, 0, 0.25)',
  lift: '0 2px 4px rgba(0, 0, 0, 0.06), 0 28px 56px -22px rgba(0, 0, 0, 0.32)',
}

export const FONT = {
  sans: '"Pretendard", "Malgun Gothic", sans-serif',
  num: '"Outfit", "Pretendard", sans-serif',
}

export const RADIUS = { card: 20, row: 12, pill: 999 }
