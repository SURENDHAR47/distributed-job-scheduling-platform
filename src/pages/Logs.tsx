import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { engine } from "../lib/engine";
import { useLive } from "../hooks/useLive";
import { Card, Select, Button } from "../components/ui";
import type { LogLevel } from "../types";

export default function Logs() {
  useLive(["log:new"]);
  const [level, setLevel] = useState<LogLevel | "">("");
  const [page, setPage] = useState(1);
  const result = engine.listLogs({ level: (level || undefined) as LogLevel | undefined, page, pageSize: 25 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Execution Logs</h1>
          <p className="text-sm text-slate-500">Structured log stream emitted by the worker fleet during job execution.</p>
        </div>
        <Select className="w-40" value={level} onChange={(e) => { setLevel(e.target.value as LogLevel | ""); setPage(1); }}>
          <option value="">All levels</option>
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </Select>
      </div>

      <Card className="p-2">
        <div className="max-h-[65vh] space-y-1 overflow-y-auto font-mono text-xs">
          {result.data.map((l) => {
            const job = engine.jobs.find((j) => j.id === l.jobId);
            return (
              <div key={l.id} className="flex gap-2 rounded px-2 py-1 hover:bg-slate-900/60">
                <span className="shrink-0 text-slate-600">{new Date(l.timestamp).toLocaleTimeString()}</span>
                <span className={`w-12 shrink-0 uppercase ${l.level === "error" ? "text-rose-400" : l.level === "warn" ? "text-amber-400" : l.level === "debug" ? "text-slate-500" : "text-sky-400"}`}>{l.level}</span>
                <span className="shrink-0 text-slate-500">[{job?.name ?? "system"}]</span>
                <span className="text-slate-300">{l.message}</span>
              </div>
            );
          })}
          {result.data.length === 0 && <p className="py-10 text-center text-slate-500">No log entries.</p>}
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 px-2 pt-2 text-xs text-slate-500">
          <span>{result.total} entries · page {result.page} of {result.totalPages}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></Button>
            <Button size="sm" variant="ghost" disabled={page >= result.totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
