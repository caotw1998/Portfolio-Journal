"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-background p-5"><section className="max-w-lg border border-border bg-card p-8"><p className="text-xs font-semibold uppercase tracking-[.2em] text-red-700">Data boundary</p><h1 className="mt-2 text-3xl font-semibold">本页数据暂时无法读取</h1><p className="mt-3 text-sm leading-7 text-muted-foreground">旧数据不会被覆盖。可以稍后重试，或前往研究库查看各分区来源状态。</p><button onClick={reset} className="mt-5 bg-accent px-5 py-2.5 text-sm text-accent-foreground">重新加载</button></section></main>;
}
