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
    <section id="workspace-profile" className="scroll-mt-20 rounded-[1.5rem] border border-border bg-card p-6 lg:scroll-mt-6">
      <h2 className="text-2xl font-semibold">研究工作区资料</h2>

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
    <section id="chart-colors" className="scroll-mt-20 rounded-[1.5rem] border border-border bg-card p-6 lg:scroll-mt-6">
      <h2 className="text-2xl font-semibold">曲线颜色</h2>

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
    <section id="feature-guide" className="scroll-mt-20 rounded-[1.5rem] border border-border bg-card p-6 lg:scroll-mt-6">
      <h2 className="text-2xl font-semibold">功能说明</h2>
      <div className="mt-5 grid gap-px bg-border sm:grid-cols-2">
        {[
          ["研究库与同步", "基金和指数加入研究库后，可按需同步公开净值、行情、档案、经理、持仓与规模数据；同步状态和数据时效在详情页的数据质量区域查看。"],
          ["业绩曲线与基准", "基金和指数详情均支持时间区间、业绩与回撤切换、曲线高亮、单点读取、双指区间和回撤修复分析。添加基准可选择研究库中的基金或指数；基金曲线另显示经理更换和分红事件。"],
          ["指数数据与代理口径", "指数优先使用原始点位；当页面明确标记 ETF 代理时，曲线代表相关 ETF 的前复权行情，不等同于指数原始点位。"],
          ["持仓、PCF 与规模", "基金持仓按公开定期报告展示；ETF 的 PCF 是交易日申赎篮子，不等同于全部实际资产。规模、份额和持有人比例使用各自单位与坐标轴。"],
          ["多标的对比与模拟组合", "对比页按共同覆盖区间统一起点，并在原始观测点计算指标。模拟组合按目标权重回看历史，余额视为现金，结果不代表真实交易或未来收益。"],
        ].map(([title, description]) => <article key={title} className="bg-background p-4"><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">{description}</p></article>)}
      </div>
    </section>
    </div>
  );
}
