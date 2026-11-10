import { useEffect, type ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
import { useApp } from '@/stores/app'
import { Button, Skeleton } from '@/components/ui'

/** 앱 시작 시 Rust API 에서 활성 주제·고객을 불러온다. 실패하면 원인과 해결 방법을 보여준다. */
export function BootProvider({ children }: { children: ReactNode }) {
  const { ready, bootError, boot } = useApp()
  useEffect(() => {
    void boot()
  }, [boot])
  if (bootError)
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="glass max-w-md rounded-[24px] p-7">
          <h1 className="text-lg font-semibold">FINOVA API에 연결하지 못했습니다</h1>
          <p className="mt-2 text-sm text-muted">{bootError}</p>
          <p className="mt-3 text-[13px] text-dim">
            backend 폴더에서 <code className="text-fg">cargo run</code>(Windows: scripts\development\cargo-msvc.cmd run)으로 서버를 실행한 뒤 다시 시도하세요.
          </p>
          <Button className="mt-4" variant="primary" onClick={() => void boot()}>
            다시 연결
          </Button>
        </div>
      </div>
    )
  if (!ready)
    return (
      // 첫 연결 중에도 앱 틀(머리말·본문 자리)을 유지한다
      <div className="h-full p-0 sm:p-3 lg:p-5" role="status" aria-label="FINOVA API에 연결하는 중" aria-busy>
        <div className="glass flex h-full flex-col gap-5 overflow-hidden p-5 sm:rounded-[28px] sm:p-8">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="mx-auto hidden h-9 w-[560px] rounded-full xl:block" />
            <Skeleton className="ml-auto h-9 w-36 rounded-full" />
          </div>
          <Skeleton className="h-10 w-64" />
          <div className="grid flex-1 gap-4 lg:grid-cols-3">
            <Skeleton className="h-full min-h-40 rounded-[24px]" />
            <Skeleton className="h-full min-h-40 rounded-[24px]" />
            <Skeleton className="h-full min-h-40 rounded-[24px]" />
          </div>
          <p className="text-center text-[12px] text-dim">Rust API에서 활성 주제와 합성 고객을 불러오는 중…</p>
        </div>
      </div>
    )
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
