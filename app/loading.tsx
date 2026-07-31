export default function Loading() {
  return <main className="min-h-screen bg-background p-5"><div className="mx-auto max-w-[1450px] animate-pulse border border-border bg-card p-6"><div className="h-3 w-40 bg-border" /><div className="mt-4 h-9 w-80 max-w-full bg-border" /><div className="mt-8 grid gap-3 md:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-28 border border-border bg-background" />)}</div><p className="mt-5 text-sm text-muted-foreground">正在整理研究数据…</p></div></main>;
}
