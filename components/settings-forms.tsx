"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  DEFAULT_CHART_SERIES_COLORS,
  DEFAULT_CHART_SINGLE_COLOR,
} from "@/lib/chart-preferences";

type Profile = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  chartSingleColor: string;
  chartSeriesColors: string[];
};

export function SettingsForms({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [name, setName] = useState(profile.name ?? "");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [chartMessage, setChartMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [chartSingleColor, setChartSingleColor] = useState(profile.chartSingleColor);
  const [chartSeriesColors, setChartSeriesColors] = useState(profile.chartSeriesColors);

  function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const result = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(result.error ?? "保存资料失败。");
        }

        setProfileMessage("工作区资料已更新。");
        router.refresh();
      } catch (error) {
        setProfileMessage(error instanceof Error ? error.message : "保存资料失败。");
      }
    });
  }

  function moveSeriesColor(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= chartSeriesColors.length) return;
    setChartSeriesColors((current) => {
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
      return next;
    });
  }

  function saveChartPreferences(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChartMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chartSingleColor, chartSeriesColors }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "保存图表设置失败。");
        setChartMessage("图表颜色设置已更新。");
        router.refresh();
      } catch (error) {
        setChartMessage(error instanceof Error ? error.message : "保存图表设置失败。");
      }
    });
  }

  return (
    <div className="grid gap-5">
    <section className="rounded-[1.5rem] border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">Workspace Profile</p>
      <h2 className="mt-2 text-2xl font-semibold">研究工作区资料</h2>

      <div className="mt-6 grid gap-3 md:grid-cols-2 layout-mobile:grid-cols-1 layout-desktop:grid-cols-2">
        <div className="rounded-[1.25rem] border border-border bg-background p-4">
          <p className="text-sm text-muted-foreground">数据归属标识</p>
          <p className="mt-2 text-base font-medium">{profile.email}</p>
        </div>
        <div className="rounded-[1.25rem] border border-border bg-background p-4">
          <p className="text-sm text-muted-foreground">工作区创建时间</p>
          <p className="mt-2 text-base font-medium">
            {new Date(profile.createdAt).toISOString().slice(0, 10)}
          </p>
        </div>
      </div>

      <form onSubmit={saveProfile} className="mt-6 flex max-w-2xl flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-muted-foreground">显示名称</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-2xl border border-border bg-background px-4 py-3 outline-none"
            placeholder="研究者"
          />
        </label>

        {profileMessage ? <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground" aria-live="polite">{profileMessage}</div> : null}
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded-full border border-accent bg-accent px-5 py-3 text-sm font-medium text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "保存中..." : "保存资料"}
        </button>
      </form>
    </section>
    <section className="rounded-[1.5rem] border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">Chart Palette</p>
      <h2 className="mt-2 text-2xl font-semibold">曲线颜色</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">单曲线使用默认色；同时展示多条曲线时，从左到右按色序循环使用。经理、分红和回撤标记保留语义色。</p>

      <form onSubmit={saveChartPreferences} className="mt-5 grid gap-5">
        <label className="flex max-w-md items-center justify-between gap-4 border border-border bg-background p-4 text-sm">
          <span><span className="block font-medium">单曲线默认颜色</span><span className="mt-1 block text-xs text-muted-foreground">适用于只展示一只基金或指数时</span></span>
          <span className="flex items-center gap-2 font-mono text-xs"><input aria-label="单曲线默认颜色" type="color" value={chartSingleColor} onChange={(event) => setChartSingleColor(event.target.value)} className="h-9 w-12 cursor-pointer border-0 bg-transparent p-0" />{chartSingleColor}</span>
        </label>

        <div>
          <p className="text-sm font-medium">多曲线颜色顺序</p>
          <div className="mt-3 grid gap-2 lg:grid-cols-2 layout-mobile:grid-cols-1 layout-desktop:grid-cols-2">
            {chartSeriesColors.map((color, index) => <div key={`${index}-${color}`} className="flex items-center gap-3 border border-border bg-background p-3"><span className="w-5 font-mono text-xs text-muted-foreground">{index + 1}</span><input aria-label={`多曲线颜色 ${index + 1}`} type="color" value={color} onChange={(event) => setChartSeriesColors((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} className="h-8 w-11 cursor-pointer border-0 bg-transparent p-0" /><span className="min-w-20 font-mono text-xs">{color}</span><span className="ml-auto flex gap-1"><button type="button" aria-label={`颜色 ${index + 1} 上移`} disabled={index === 0} onClick={() => moveSeriesColor(index, -1)} className="border border-border px-2 py-1 text-xs disabled:opacity-30">↑</button><button type="button" aria-label={`颜色 ${index + 1} 下移`} disabled={index === chartSeriesColors.length - 1} onClick={() => moveSeriesColor(index, 1)} className="border border-border px-2 py-1 text-xs disabled:opacity-30">↓</button></span></div>)}
          </div>
        </div>

        <div className="border border-border bg-background p-4">
          <p className="text-xs text-muted-foreground">实时预览</p>
          <div className="mt-4 flex h-20 items-end gap-3 overflow-hidden border-b border-l border-border px-3">{chartSeriesColors.map((color, index) => <span key={color + index} className="block w-full rounded-t-sm" style={{ height: `${35 + ((index * 17) % 55)}%`, backgroundColor: color }} />)}</div>
        </div>

        {chartMessage ? <div className="border border-border bg-background px-4 py-3 text-sm text-muted-foreground" aria-live="polite">{chartMessage}</div> : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={isPending} className="bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-60">{isPending ? "保存中..." : "保存图表设置"}</button>
          <button type="button" disabled={isPending} onClick={() => { setChartSingleColor(DEFAULT_CHART_SINGLE_COLOR); setChartSeriesColors([...DEFAULT_CHART_SERIES_COLORS]); }} className="border border-border bg-background px-5 py-2.5 text-sm">恢复默认</button>
        </div>
      </form>
    </section>
    </div>
  );
}
