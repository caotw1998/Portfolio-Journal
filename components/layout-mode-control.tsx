"use client";

import { useEffect, useState } from "react";

export type LayoutMode = "auto" | "mobile" | "desktop";

const options: Array<{ id: LayoutMode; label: string }> = [
  { id: "auto", label: "自动" },
  { id: "mobile", label: "手机" },
  { id: "desktop", label: "电脑" },
];

export function LayoutModeControl({ initialMode }: { initialMode: LayoutMode }) {
  const [mode, setMode] = useState(initialMode);

  useEffect(() => {
    document.documentElement.dataset.layoutMode = mode;
    document.cookie = `portfolio-layout-mode=${mode}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [mode]);

  return (
    <div className="flex items-center gap-1 border border-border bg-background p-1" role="group" aria-label="界面布局">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          data-layout-mode-option={option.id}
          data-selected={mode === option.id}
          aria-pressed={mode === option.id}
          onClick={() => setMode(option.id)}
          className="px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
