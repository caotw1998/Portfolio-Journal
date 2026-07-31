"use client";

import { useEffect, useState } from "react";

export type PageSectionNavItem = {
  id: string;
  label: string;
};

export function PageSectionNav({
  items,
  ariaLabel = "页面大纲",
  title = "章节导航",
}: {
  items: PageSectionNavItem[];
  ariaLabel?: string;
  title?: string;
}) {
  const [activeSection, setActiveSection] = useState(items[0]?.id ?? "");

  function revealSection(id: string) {
    const target = document.getElementById(id);
    const disclosure = target?.closest<HTMLDetailsElement>("details[data-responsive-disclosure]");
    if (disclosure && !disclosure.open) disclosure.open = true;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => target?.scrollIntoView({ block: "start" }));
    });
  }

  useEffect(() => {
    let animationFrame = 0;
    let honorLocationHash = true;

    function updateActiveSection() {
      const sections = items
        .map((item) => document.getElementById(item.id))
        .filter((section): section is HTMLElement => section !== null);
      if (!sections.length) return;

      const hashSection = window.location.hash.slice(1);
      if (honorLocationHash && sections.some((section) => section.id === hashSection)) {
        setActiveSection(hashSection);
        return;
      }

      const readingLine = Math.min(window.innerHeight * 0.28, 220);
      let currentSection = sections[0].id;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= readingLine)
          currentSection = section.id;
      }

      const reachedPageEnd =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      setActiveSection(reachedPageEnd ? sections.at(-1)!.id : currentSection);
    }

    function scheduleUpdate() {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateActiveSection);
    }

    function updateFromScroll() {
      honorLocationHash = false;
      scheduleUpdate();
    }

    function updateFromHash() {
      honorLocationHash = true;
      scheduleUpdate();
    }

    scheduleUpdate();
    window.addEventListener("scroll", updateFromScroll, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("hashchange", updateFromHash);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", updateFromScroll);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("hashchange", updateFromHash);
    };
  }, [items]);

  return (
    <nav
      aria-label={ariaLabel}
      className="sticky top-0 z-30 w-full min-w-0 max-w-full self-start overflow-hidden border border-border bg-card/95 px-2 py-2 shadow-[0_12px_35px_rgba(54,45,31,0.08)] backdrop-blur lg:top-6 lg:px-3 lg:py-4 layout-mobile:top-0 layout-mobile:w-full layout-mobile:px-2 layout-mobile:py-2 layout-desktop:top-6 layout-desktop:px-3 layout-desktop:py-4"
    >
      <div className="mb-3 hidden border-b border-border pb-3 lg:block layout-mobile:hidden layout-desktop:block">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Page index
        </p>
        <p className="mt-1 text-sm font-semibold">{title}</p>
      </div>
      <div className="grid w-full min-w-0 grid-flow-col auto-cols-fr gap-1.5 lg:grid-flow-row lg:auto-cols-auto layout-mobile:grid-flow-col layout-mobile:auto-cols-fr layout-desktop:grid-flow-row layout-desktop:auto-cols-auto">
        {items.map((item, index) => {
          const isActive = activeSection === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={() => revealSection(item.id)}
              aria-current={isActive ? "location" : undefined}
              className={`group flex min-w-0 items-center justify-center gap-1 border px-1.5 py-2 text-center text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:justify-between lg:px-3 lg:text-xs layout-mobile:min-w-0 layout-mobile:justify-center layout-mobile:px-1.5 layout-mobile:text-[11px] layout-desktop:justify-between layout-desktop:px-3 layout-desktop:text-xs ${
                isActive
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-foreground"
              }`}
            >
              <span>{item.label}</span>
              <span
                aria-hidden="true"
                className={`hidden font-mono text-[10px] lg:inline layout-mobile:hidden layout-desktop:inline ${isActive ? "text-accent-foreground/70" : "text-muted-foreground/60"}`}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

export const FundSectionNav = PageSectionNav;
export type FundSectionNavItem = PageSectionNavItem;
