// 표시 전용 서식. 재무 계산은 하지 않는다(계산은 Rust 엔진 전담).
import type { Unit } from '@/types/api'

const nf = new Intl.NumberFormat('ko-KR')

export const won = (v: number | null | undefined) => (v == null ? '—' : `${nf.format(v)}원`)

/** 만원 단위 축약: 12,345,000 → 1,234.5만 */
export function manwon(v: number | null | undefined): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 100_000_000) return `${(v / 100_000_000).toFixed(abs >= 1_000_000_000 ? 1 : 2).replace(/\.0+$/, '')}억`
  if (abs >= 10_000) return `${nf.format(Math.round(v / 10_000))}만`
  return nf.format(v)
}

export const pct = (bps: number | null | undefined) => (bps == null ? '—' : `${(bps / 100).toFixed(2)}%`)

export function formatMetric(unit: Unit | null | undefined, v: number | null | undefined): string {
  if (v == null) return '해당 없음'
  switch (unit) {
    case 'won':
      return won(v)
    case 'bps':
      return pct(v)
    case 'months_x10':
      return `${(v / 10).toFixed(1)}개월`
    case 'months':
      return `${v}개월 차`
    case 'count':
      return `${v}개`
    default:
      return String(v)
  }
}

export function shortMetric(unit: Unit | null | undefined, v: number | null | undefined): string {
  if (v == null) return '—'
  if (unit === 'won') return manwon(v)
  return formatMetric(unit, v)
}

export const signed = (v: number) => (v > 0 ? `+${manwon(v)}` : manwon(v))

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}
