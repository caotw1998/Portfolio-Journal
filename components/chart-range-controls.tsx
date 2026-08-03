"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { ChartRangePreset, MarketCycleOption } from "@/lib/chart-time-range";
import { CHART_RANGE_PRESET_OPTIONS } from "@/lib/chart-time-range";

const QUICK_RANGE_PRESETS = new Set<ChartRangePreset>(["1m", "6m"]);
const MENU_RANGE_PRESETS = new Set<ChartRangePreset>(["1y", "3y", "5y", "10y", "inception", "custom"]);

export function ChartRangeControls({
  preset,
  customFrom,
  customTo,
  disabled,
  testId,
  marketCycleOptions,
  selectedMarketCycleId,
  currentManagerStartDate,
  isCurrentManagerRangeSelected,
  onPresetChange,
  onMarketCycleChange,
  onCurrentManagerRangeChange,
  onCustomFromChange,
  onCustomToChange,
  onApplyCustom,
}: {
  preset: ChartRangePreset;
  customFrom: string;
  customTo: string;
  disabled?: boolean;
  testId?: string;
  marketCycleOptions?: MarketCycleOption[];
  selectedMarketCycleId?: string | null;
  currentManagerStartDate?: string | null;
  isCurrentManagerRangeSelected?: boolean;
  onPresetChange: (preset: ChartRangePreset) => void;
  onMarketCycleChange?: (cycleId: string) => void;
  onCurrentManagerRangeChange?: () => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  onApplyCustom: () => void;
}) {
  const [isRangeMenuOpen, setIsRangeMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const selectedCycle = marketCycleOptions?.find((option) => option.id === selectedMarketCycleId);
  const selectedPresetLabel = CHART_RANGE_PRESET_OPTIONS.find((option) => option.id === preset)?.label;
  const activeMenuLabel = selectedCycle?.label
    ?? (isCurrentManagerRangeSelected ? "现任经理以来" : MENU_RANGE_PRESETS.has(preset) ? selectedPresetLabel : null)
    ?? "更多区间";
  const menuIsActive = Boolean(selectedCycle || isCurrentManagerRangeSelected || MENU_RANGE_PRESETS.has(preset));

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!menuContainerRef.current?.contains(event.target as Node)) setIsRangeMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsRangeMenuOpen(false);
      menuTriggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const focusMenuItem = () => {
      const items = Array.from(menuContainerRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
      if (!items.length) return;
      const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = activeIndex === -1
        ? event.key === "ArrowDown" ? 0 : items.length - 1
        : (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[nextIndex]?.focus();
    };

    if (!isRangeMenuOpen) {
      setIsRangeMenuOpen(true);
      requestAnimationFrame(focusMenuItem);
      return;
    }
    focusMenuItem();
  }

  function selectPreset(nextPreset: ChartRangePreset) {
    onPresetChange(nextPreset);
    setIsRangeMenuOpen(false);
  }

  function selectCurrentManagerRange() {
    onCurrentManagerRangeChange?.();
    setIsRangeMenuOpen(false);
  }

  function selectMarketCycle(cycleId: string) {
    onMarketCycleChange?.(cycleId);
    setIsRangeMenuOpen(false);
  }

  return (
    <div data-testid={testId} className="w-full">
      <div className="flex w-full flex-wrap items-center justify-start gap-1">
        {CHART_RANGE_PRESET_OPTIONS.filter((option) => QUICK_RANGE_PRESETS.has(option.id)).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onPresetChange(option.id)}
            disabled={disabled}
            className={preset === option.id && !selectedCycle && !isCurrentManagerRangeSelected
              ? "h-8 border border-accent bg-accent px-2.5 text-[11px] font-medium text-accent-foreground"
              : "h-8 border border-border bg-background px-2.5 text-[11px] text-muted-foreground"}
          >
            {option.label}
          </button>
        ))}

        <div ref={menuContainerRef} onKeyDown={handleMenuKeyDown} className="relative min-w-0">
          <button
            ref={menuTriggerRef}
            type="button"
            aria-label={`时间区间：${activeMenuLabel}`}
            aria-expanded={isRangeMenuOpen}
            aria-haspopup="menu"
            onClick={() => setIsRangeMenuOpen((open) => !open)}
            disabled={disabled}
            className={menuIsActive
              ? "flex h-8 max-w-[15rem] items-center border border-accent bg-accent px-2.5 text-[11px] font-medium text-accent-foreground"
              : "flex h-8 max-w-[15rem] items-center border border-border bg-background px-2.5 text-[11px] text-muted-foreground"}
          >
            <span className="truncate">{activeMenuLabel}</span><span className="ml-1.5 shrink-0" aria-hidden="true">⌄</span>
          </button>

          {isRangeMenuOpen ? (
            <div role="menu" aria-label="选择时间区间" className="fixed bottom-20 left-1/2 z-[60] max-h-[min(30rem,calc(100dvh-8rem))] w-72 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 overflow-y-auto border border-border bg-card p-1 text-left shadow-xl layout-desktop:absolute layout-desktop:bottom-full layout-desktop:left-0 layout-desktop:mb-2 layout-desktop:translate-x-0">
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">常用区间</p>
              {CHART_RANGE_PRESET_OPTIONS.filter((item) => MENU_RANGE_PRESETS.has(item.id)).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  aria-current={!selectedCycle && !isCurrentManagerRangeSelected && preset === item.id ? "true" : undefined}
                  onClick={() => selectPreset(item.id)}
                  className={!selectedCycle && !isCurrentManagerRangeSelected && preset === item.id
                    ? "min-h-10 w-full bg-muted px-3 py-2 text-left text-sm font-medium"
                    : "min-h-10 w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted"}
                >
                  {item.label}
                </button>
              ))}

              {currentManagerStartDate && onCurrentManagerRangeChange ? (
                <>
                  <p className="border-t border-border px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">研究区间</p>
                  <button type="button" role="menuitem" aria-label={`现任经理以来 · ${currentManagerStartDate}`} onClick={selectCurrentManagerRange} className={isCurrentManagerRangeSelected ? "min-h-10 w-full bg-muted px-3 py-2 text-left" : "min-h-10 w-full px-3 py-2 text-left hover:bg-muted focus:bg-muted"}>
                    <span className="block text-sm font-medium">现任经理以来</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{currentManagerStartDate} 起</span>
                  </button>
                </>
              ) : null}

              {marketCycleOptions?.length && onMarketCycleChange ? (
                <>
                  <p className="border-t border-border px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">A股牛熊周期</p>
                  {marketCycleOptions.map((cycle) => (
                    <button key={cycle.id} type="button" role="menuitem" aria-current={selectedMarketCycleId === cycle.id ? "true" : undefined} onClick={() => selectMarketCycle(cycle.id)} className={selectedMarketCycleId === cycle.id ? "min-h-10 w-full bg-muted px-3 py-2 text-left text-sm font-medium" : "min-h-10 w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted"}>{cycle.label}</button>
                  ))}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {preset === "custom" ? (
        <div className="mt-1.5 flex w-full flex-wrap items-center gap-1">
          <input aria-label="开始日期" type="date" value={customFrom} onChange={(event) => onCustomFromChange(event.target.value)} disabled={disabled} className="h-8 min-w-0 flex-1 border border-border bg-background px-2 text-[11px]" />
          <span className="text-[11px] text-muted-foreground">至</span>
          <input aria-label="结束日期" type="date" value={customTo} onChange={(event) => onCustomToChange(event.target.value)} disabled={disabled} className="h-8 min-w-0 flex-1 border border-border bg-background px-2 text-[11px]" />
          <button type="button" onClick={onApplyCustom} disabled={disabled || !customFrom || !customTo} className="h-8 border border-border bg-background px-2.5 text-[11px] font-medium">应用</button>
        </div>
      ) : null}
    </div>
  );
}
