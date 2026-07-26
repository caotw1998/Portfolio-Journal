"use client";

import { useEffect, useState } from "react";

export type FundSectionNavItem = {
  id: string;
  label: string;
};

export function FundSectionNav({ items }: { items: FundSectionNavItem[] }) {
  const [activeSection, setActiveSection] = useState(items[0]?.id ?? "");

  useEffect(() => {
    let animationFrame = 0;

    function updateActiveSection() {
      const sections = items
        .map((item) => document.getElementById(item.id))
        .filter((section): section is HTMLElement => section !== null);
      if (!sections.length) return;

      const hashSection = window.location.hash.slice(1);
      if (window.scrollY < 2 && sections.some((section) => section.id === hashSection)) {
        setActiveSection(hashSection);
        return;
      }

      const readingLine = Math.min(window.innerHeight * 0.28, 220);
      let currentSection = sections[0].id;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= readingLine) currentSection = section.id;
      }

      const reachedPageEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setActiveSection(reachedPageEnd ? sections.at(-1)!.id : currentSection);
    }

    function scheduleUpdate() {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateActiveSection);
    }

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("hashchange", scheduleUpdate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("hashchange", scheduleUpdate);
    };
  }, [items]);

  return (
    <nav
      aria-label="基金详情页内导航"
      className="sticky top-0 z-30 -mx-4 self-start overflow-x-auto border-y border-border bg-card/95 px-4 py-3 shadow-[0_12px_35px_rgba(54,45,31,0.08)] backdrop-blur md:-mx-8 md:px-8 lg:top-6 lg:mx-0 lg:overflow-visible lg:border lg:px-3 lg:py-4"
    >
      <div className="mb-3 hidden border-b border-border pb-3 lg:block">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Page index</p>
        <p className="mt-1 text-sm font-semibold">章节导航</p>
      </div>
      <div className="flex w-max gap-2 lg:grid lg:w-full lg:gap-1.5">
        {items.map((item, index) => {
          const isActive = activeSection === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={isActive ? "location" : undefined}
              className={`group flex min-w-max items-center gap-2 border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:min-w-0 lg:justify-between ${
                isActive
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-foreground"
              }`}
            >
              <span>{item.label}</span>
              <span aria-hidden="true" className={`hidden font-mono text-[10px] lg:inline ${isActive ? "text-accent-foreground/70" : "text-muted-foreground/60"}`}>
                {String(index + 1).padStart(2, "0")}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
