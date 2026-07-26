"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { ChartRangePreset, MarketCycleOption } from "@/lib/chart-time-range";
import { CHART_RANGE_PRESET_OPTIONS } from "@/lib/chart-time-range";

const LONG_RANGE_PRESETS = new Set<ChartRangePreset>(["3y", "5y", "10y"]);

export function ChartRangeControls({
  preset,
  customFrom,
  customTo,
  disabled,
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
  const [isLongRangeMenuOpen, setIsLongRangeMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const useLongRangeMenu = Boolean(
    (marketCycleOptions?.length && onMarketCycleChange)
      || (currentManagerStartDate && onCurrentManagerRangeChange),
  );
  const selectedCycle = marketCycleOptions?.find((option) => option.id === selectedMarketCycleId);
  const activeLongLabel = isCurrentManagerRangeSelected
    ? "现任经理以来"
    : selectedCycle?.label
    ?? CHART_RANGE_PRESET_OPTIONS.find((option) => option.id === preset && LONG_RANGE_PRESETS.has(option.id))?.label
    ?? "3年";
  const longRangeIsActive = Boolean(
    isCurrentManagerRangeSelected || selectedCycle || LONG_RANGE_PRESETS.has(preset),
  );

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!menuContainerRef.current?.contains(event.target as Node)) {
        setIsLongRangeMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsLongRangeMenuOpen(false);
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
      const items = Array.from(
        menuContainerRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
      );
      if (!items.length) return;
      const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = activeIndex === -1
        ? event.key === "ArrowDown" ? 0 : items.length - 1
        : (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[nextIndex]?.focus();
    };

    if (!isLongRangeMenuOpen) {
      setIsLongRangeMenuOpen(true);
      requestAnimationFrame(focusMenuItem);
      return;
    }
    focusMenuItem();
  }

  function selectLongPreset(nextPreset: ChartRangePreset) {
    onPresetChange(nextPreset);
    setIsLongRangeMenuOpen(false);
  }

  function selectMarketCycle(cycleId: string) {
    onMarketCycleChange?.(cycleId);
    setIsLongRangeMenuOpen(false);
  }

  function selectCurrentManagerRange() {
    onCurrentManagerRangeChange?.();
    setIsLongRangeMenuOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {CHART_RANGE_PRESET_OPTIONS.map((option) => {
        if (useLongRangeMenu && (option.id === "5y" || option.id === "10y")) return null;
        if (useLongRangeMenu && option.id === "3y") {
          return (
            <div key={option.id} ref={menuContainerRef} onKeyDown={handleMenuKeyDown} className="relative">
              <button
                ref={menuTriggerRef}
                type="button"
                aria-label={`长期区间：${activeLongLabel}`}
                aria-expanded={isLongRangeMenuOpen}
                aria-haspopup="menu"
                onClick={() => setIsLongRangeMenuOpen((open) => !open)}
                disabled={disabled}
                className={longRangeIsActive ? "border border-accent bg-accent px-3 py-1.5 text-xs text-accent-foreground" : "border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"}
              >
                {activeLongLabel}<span className="ml-1.5" aria-hidden="true">⌄</span>
              </button>
              {isLongRangeMenuOpen ? (
                <div role="menu" aria-label="选择长期时间区间" className="absolute right-0 z-30 mt-2 w-72 border border-border bg-card p-1 text-left shadow-xl">
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">滚动区间</p>
                  {CHART_RANGE_PRESET_OPTIONS.filter((item) => LONG_RANGE_PRESETS.has(item.id)).map((item) => (
                    <button key={item.id} type="button" role="menuitem" onClick={() => selectLongPreset(item.id)} className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted">{item.label}</button>
                  ))}
                  {currentManagerStartDate && onCurrentManagerRangeChange ? (
                    <button type="button" role="menuitem" aria-label={`现任经理以来 · ${currentManagerStartDate}`} onClick={selectCurrentManagerRange} className="w-full px-3 py-2 text-left hover:bg-muted focus:bg-muted">
                      <span className="block text-sm font-medium">现任经理以来</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{currentManagerStartDate} 起</span>
                    </button>
                  ) : null}
                  <div className="my-1 border-t border-border" />
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">A股周期起点</p>
                  {marketCycleOptions?.map((cycle) => (
                    <button key={cycle.id} type="button" role="menuitem" aria-label={`${cycle.label} · ${cycle.from}`} onClick={() => selectMarketCycle(cycle.id)} className="w-full px-3 py-2 text-left hover:bg-muted focus:bg-muted">
                      <span className="block text-sm font-medium">{cycle.label}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{cycle.from}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        }
        return (
          <button key={option.id} type="button" onClick={() => onPresetChange(option.id)} disabled={disabled} className={preset === option.id && !selectedCycle ? "border border-accent bg-accent px-3 py-1.5 text-xs text-accent-foreground" : "border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"}>{option.label}</button>
        );
      })}
      {preset === "custom" ? (
        <>
          <input aria-label="开始日期" type="date" value={customFrom} onChange={(event) => onCustomFromChange(event.target.value)} disabled={disabled} className="border border-border bg-background px-2 py-1.5 text-xs" />
          <span className="text-xs text-muted-foreground">至</span>
          <input aria-label="结束日期" type="date" value={customTo} onChange={(event) => onCustomToChange(event.target.value)} disabled={disabled} className="border border-border bg-background px-2 py-1.5 text-xs" />
          <button type="button" onClick={onApplyCustom} disabled={disabled || !customFrom || !customTo} className="border border-border bg-background px-3 py-1.5 text-xs">应用</button>
        </>
      ) : null}
    </div>
  );
}
