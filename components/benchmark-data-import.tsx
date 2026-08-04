"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function BenchmarkDataImport({ benchmarkId }: { benchmarkId: string }) {
  const router = useRouter();
  const valuationInput = useRef<HTMLInputElement>(null);
  const constituentInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function importFile(kind: "valuation" | "constituent", file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage("正在校验并导入……");
    try {
      const csv = await file.text();
      const validateResponse = await fetch(`/api/benchmarks/${benchmarkId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, csv, dryRun: true }),
      });
      const validateBody = await validateResponse.json() as { error?: string };
      if (!validateResponse.ok) throw new Error(validateBody.error ?? "CSV 校验失败。");
      const response = await fetch(`/api/benchmarks/${benchmarkId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, csv }),
      });
      const body = await response.json() as { result?: { rows?: number; snapshots?: number; constituents?: number }; error?: string };
      if (!response.ok) throw new Error(body.error ?? "导入失败。");
      setMessage(kind === "valuation" ? `估值导入完成：${body.result?.rows ?? 0} 行。` : `成分股导入完成：${body.result?.snapshots ?? 0} 个快照、${body.result?.constituents ?? 0} 条记录。`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败。");
    } finally {
      setBusy(false);
      if (valuationInput.current) valuationInput.current.value = "";
      if (constituentInput.current) constituentInput.current.value = "";
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <input ref={valuationInput} className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => void importFile("valuation", event.target.files?.[0])} />
      <input ref={constituentInput} className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => void importFile("constituent", event.target.files?.[0])} />
      <button type="button" disabled={busy} onClick={() => valuationInput.current?.click()} className="min-h-9 border border-border bg-background px-3 text-xs font-medium disabled:opacity-50">导入估值 CSV</button>
      <button type="button" disabled={busy} onClick={() => constituentInput.current?.click()} className="min-h-9 border border-border bg-background px-3 text-xs font-medium disabled:opacity-50">导入成分股 CSV</button>
      {message ? <p className="text-xs text-muted-foreground" aria-live="polite">{message}</p> : null}
    </div>
  );
}
