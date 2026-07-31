"use client";

import { useEffect, useRef } from "react";

function usesMobileLayout() {
  const mode = document.documentElement.dataset.layoutMode;
  if (mode === "mobile") return true;
  if (mode === "desktop") return false;
  return window.matchMedia("(max-width: 1023px)").matches;
}

export function ResponsiveDisclosure({
  targetId,
  title,
  summary,
  children,
}: {
  targetId: string;
  title: string;
  summary?: string;
  children: React.ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;

    function hashTargetsDisclosure() {
      const hashTarget = document.getElementById(window.location.hash.slice(1));
      return Boolean(hashTarget && details?.contains(hashTarget));
    }

    const nextOpen = hashTargetsDisclosure() || !usesMobileLayout();
    details.open = nextOpen;

    function revealHashTarget() {
      if (!hashTargetsDisclosure()) return;
      details!.open = true;
    }

    window.addEventListener("hashchange", revealHashTarget);
    return () => window.removeEventListener("hashchange", revealHashTarget);
  }, [targetId]);

  return (
    <details
      ref={detailsRef}
      data-responsive-disclosure={targetId}
      className="group min-w-0"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 border border-border bg-card px-4 py-3 marker:hidden transition-colors hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{title}</span>
          {summary ? <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{summary}</span> : null}
        </span>
        <span className="shrink-0 text-xs font-medium text-accent">
          <span className="group-open:hidden">展开</span><span className="hidden group-open:inline">收起</span>
          <span aria-hidden="true" className="ml-2 inline-block transition-transform group-open:rotate-180">⌄</span>
        </span>
      </summary>
      <div className="mt-2 min-w-0">{children}</div>
    </details>
  );
}
