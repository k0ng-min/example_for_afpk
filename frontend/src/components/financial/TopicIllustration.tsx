// 주제별 SVG 모티프(저작권 이미지 없이 직접 구현). 구성 파일의 heroMotif id 로만 선택된다.
import { motion } from 'motion/react'

const draw = { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration: 1.4, ease: 'easeInOut' as const } }

export function TopicIllustration({ motif, className }: { motif: string; className?: string }) {
  const stroke = 'var(--accent)'
  const soft = 'color-mix(in oklab, var(--accent) 35%, transparent)'
  return (
    <svg viewBox="0 0 240 200" className={className} role="img" aria-label="주제 일러스트">
      <defs>
        <radialGradient id="ill-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="100" r="92" fill="url(#ill-glow)" />
      {motif === 'commitment' && (
        <g fill="none" strokeWidth="2.2" strokeLinecap="round">
          <motion.path d="M60 120 C60 70, 120 60, 120 100 C120 140, 180 130, 180 80" stroke={stroke} {...draw} />
          <motion.path d="M60 80 C60 130, 120 140, 120 100 C120 60, 180 70, 180 120" stroke="var(--violet)" {...draw} />
          <circle cx="60" cy="100" r="7" fill="var(--panel-solid)" stroke={stroke} />
          <circle cx="180" cy="100" r="7" fill="var(--panel-solid)" stroke="var(--violet)" />
          <circle cx="120" cy="100" r="4" fill={stroke} />
        </g>
      )}
      {motif === 'contagion' && (
        <g fill="none" strokeWidth="2">
          {[
            [70, 70],
            [100, 140],
            [160, 60],
            [175, 135],
          ].map(([x, y], i) => (
            <motion.line key={i} x1="120" y1="100" x2={x} y2={y} stroke={soft} {...draw} transition={{ ...draw.transition, delay: i * 0.15 }} />
          ))}
          <circle cx="120" cy="100" r="16" fill="var(--panel-solid)" stroke={stroke} strokeWidth="2.5" />
          {[
            [70, 70, 8],
            [100, 140, 6],
            [160, 60, 10],
            [175, 135, 7],
          ].map(([x, y, r], i) => (
            <motion.circle key={i} cx={x} cy={y} r={r} fill="var(--panel-solid)" stroke={i % 2 ? 'var(--danger)' : stroke} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.4 + i * 0.12 }} />
          ))}
        </g>
      )}
      {motif === 'care_wave' && (
        <g fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="30" y1="110" x2="210" y2="110" stroke="var(--line-strong)" />
          <motion.path d="M30 110 L80 110 L95 80 L110 140 L125 60 L140 110 L210 110" stroke={stroke} {...draw} />
          <rect x="140" y="40" width="70" height="120" rx="6" fill="color-mix(in oklab, var(--accent) 8%, transparent)" stroke={soft} strokeDasharray="3 5" />
          <text x="175" y="56" textAnchor="middle" fontSize="10" fill="var(--text-muted)">72h</text>
        </g>
      )}
      {motif === 'discovery' && (
        <g fill="none" strokeWidth="2">
          <circle cx="120" cy="100" r="58" stroke={soft} />
          <circle cx="120" cy="100" r="34" stroke={soft} strokeDasharray="2 5" />
          <motion.path d="M120 48 L132 100 L120 152 L108 100 Z" stroke={stroke} {...draw} />
          {[0, 1, 2].map((i) => (
            <motion.circle key={i} cx={120 + 58 * Math.cos((i * 2.1) + 0.6)} cy={100 + 58 * Math.sin((i * 2.1) + 0.6)} r="6" fill="var(--panel-solid)" stroke={i === 0 ? 'var(--ok)' : stroke} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 + i * 0.2 }} />
          ))}
        </g>
      )}
      {motif === 'court' && (
        <g fill="none" strokeWidth="2.2" strokeLinecap="round">
          <line x1="120" y1="45" x2="120" y2="160" stroke={stroke} />
          <motion.line x1="65" y1="70" x2="175" y2="62" stroke={stroke} initial={{ rotate: -6 }} animate={{ rotate: 0 }} transition={{ duration: 1.2 }} style={{ originX: '120px', originY: '66px' }} />
          <path d="M65 70 L50 110 L80 110 Z" stroke="var(--violet)" />
          <path d="M175 62 L160 102 L190 102 Z" stroke="var(--cyan)" />
          <line x1="95" y1="160" x2="145" y2="160" stroke={stroke} />
        </g>
      )}
      {(motif === 'orbit' || !['commitment', 'contagion', 'care_wave', 'discovery', 'court'].includes(motif)) && (
        <g fill="none" strokeWidth="1.8">
          <ellipse cx="120" cy="100" rx="88" ry="34" stroke={soft} />
          <ellipse cx="120" cy="100" rx="60" ry="70" stroke={soft} transform="rotate(30 120 100)" />
          <motion.circle cx="120" cy="100" r="14" fill="var(--panel-solid)" stroke={stroke} strokeWidth="2.5" initial={{ scale: 0.6 }} animate={{ scale: 1 }} />
          <motion.circle r="5" fill={stroke} initial={{ cx: 32, cy: 100 }} animate={{ cx: [32, 120, 208, 120, 32], cy: [100, 66, 100, 134, 100] }} transition={{ duration: 9, repeat: Infinity, ease: 'linear' }} />
        </g>
      )}
    </svg>
  )
}
