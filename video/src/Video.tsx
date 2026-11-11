// 전체 영상: 장면 8개를 부드러운 교차 전환으로 잇고, 장면마다 자막(내레이션 대본에서 자동 생성)과 선택적 내레이션 음성을 얹는다.
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { Captions } from './components/motion'
import { loadFonts } from './design/fonts'
import { loadIdea } from './config/active'
import { FPS, SCENE_ORDER, TRANSITION_FRAMES, type SceneId } from './config/schema'
import { captionsFor, sceneFrames } from './config/timing'
import { NARRATIONS, SNAPSHOTS } from './data'
import { Problem } from './scenes/Problem'
import { Intro } from './scenes/Intro'
import { Client } from './scenes/Client'
import { Ai } from './scenes/Ai'
import { Simulate } from './scenes/Simulate'
import { Verify } from './scenes/Verify'
import { Plan } from './scenes/Plan'
import { Ending } from './scenes/Ending'
import type { SceneProps } from './scenes/types'

loadFonts()

const SCENES: Record<SceneId, (p: SceneProps) => JSX.Element> = { problem: Problem, intro: Intro, client: Client, ai: Ai, simulate: Simulate, verify: Verify, plan: Plan, ending: Ending }

export type VideoProps = { ideaId?: string; captions?: boolean; voice?: boolean }

export function FinovaPromo({ ideaId, captions = true, voice = true }: VideoProps) {
  const cfg = loadIdea(ideaId)
  const snap = SNAPSHOTS[cfg.snapshot]
  if (!snap) throw new Error(`스냅샷 미등록: ${cfg.snapshot} (src/data/index.ts)`)
  const nar = voice ? NARRATIONS[cfg.id] : undefined
  return (
    <AbsoluteFill style={{ background: '#F6F6F7' }}>
      <TransitionSeries>
        {SCENE_ORDER.flatMap((id, k) => {
          const Scene = SCENES[id]
          const audio = cfg.narrationAudio?.[id]
          const spoken = nar?.scenes[id]
          // 자막: 직접 지정 > 음성 시각(실제 말소리 기준) > 대본 글자 수 비례
          const cues = cfg.captions?.[id] ?? spoken?.cues ?? captionsFor(cfg, id)
          const seq = (
            <TransitionSeries.Sequence key={id} durationInFrames={sceneFrames(cfg, id)}>
              <Scene cfg={cfg} snap={snap} />
              {captions && <Captions cues={cues} />}
              {spoken && !audio && (
                <Sequence from={Math.round(spoken.from * FPS)} layout="none">
                  <Audio src={staticFile(spoken.file)} />
                </Sequence>
              )}
              {audio && <Audio src={staticFile(audio)} />}
            </TransitionSeries.Sequence>
          )
          return k === 0 ? [seq] : [<TransitionSeries.Transition key={`t-${id}`} presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })} />, seq]
        })}
      </TransitionSeries>
    </AbsoluteFill>
  )
}
