import { Composition } from 'remotion'
import { FinovaPromo, type VideoProps } from './Video'
import { loadIdea } from './config/active'
import { FPS } from './config/schema'
import { totalFrames } from './config/timing'

export function Root() {
  return (
    <Composition
      id="FinovaPromo"
      component={FinovaPromo}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={totalFrames(loadIdea())}
      defaultProps={{ captions: true } as VideoProps}
      calculateMetadata={({ props }: { props: VideoProps }) => ({ durationInFrames: totalFrames(loadIdea(props.ideaId)) })}
    />
  )
}
