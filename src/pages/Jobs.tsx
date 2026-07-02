import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { engine } from "../lib/engine";
import { useLive } from "../hooks/useLive";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Modal, Field, Input, Select, Textarea, Badge, statusTone } from "../components/ui";
import type { JobStatus, JobType } from "../types";

const STATUSES: JobStatus[] = ["QUEUED", "SCHEDULED", "CLAIMED", "RUNNING", "RETRYING", "COMPLETED", "FAILED", "DEAD_LETTER", "CANCELLED"];
const TYPES: JobType[] = ["IMMEDIATE", "DELAYED", "SCHEDULED", "RECURRING", "BATCH"];

export default function Jobs() {
  useLive(["state:sync"]);
  const { currentOrgId, can } = useAuth();
  const canManage = can(["ADMIN", "DEVELOPER"]);
  const projects = currentOrgId ? engine.listProjects(currentOrgId) : [];
  const projectIds = new Set(projects.map((p) => p.id));
  const allQueues = engine.listQueues().filter((q) => projectIds.has(q.projectId));

  const [queueId, setQueueId] = useState("");
  const [status, setStatus] = useState<JobStatus | "">("");
  const [type, setType] = useState<JobType | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [open, setOpen] = useState(false);

  const result = engine.listJobs({
    queueId: queueId || undefined, status: (status || undefined) as JobStatus | undefined, type: (type || undefined) as JobType | undefined,
    search: search || undefined, page, pageSize: 10, sortBy, sortDir,
  });
  const scoped = { ...result, data: result.data.filter((j) => allQueues.some((q) => q.id === j.queueId)) };

  const [form, setForm] = useState({
    queueId: allQueues[0]?.id ?? "", name: "", type: "IMMEDIATE" as JobType, payload: '{\n  "durationMs": 2000\n}',
    priority: 5, maxAttempts: 3, runAt: "", cronExpression: "*/30 * * * * *", batchSize: 5, forceFail: false,
  });

  async function createJob(e: React.FormEvent) {
    e.preventDefault();
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(form.payload || "{}"); } catch { alert("Payload must be valid JSON"); return; }
    if (form.forceFail) payload.forceFail = true;
    await engine.createJob({
      queueId: form.queueId, name: form.name.trim() || "untitled-job", type: form.type, payload,
      priority: Number(form.priority), maxAttempts: Number(form.maxAttempts),
      runAt: form.type === "DELAYED" || form.type === "SCHEDULED" ? new Date(form.runAt || Date.now() + 5000).toISOString() : undefined,
      cronExpression: form.type === "RECURRING" ? form.cronExpression : undefined,
      batchSize: form.type === "BATCH" ? Number(form.batchSize) : undefined,
    });
    setOpen(false);
    setForm({ ...form, name: "" });
  }

  function toggleSort(field: string) {
    if (sortBy === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("desc"); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Jobs</h1>
          <p className="text-sm text-slate-500">Immediate, delayed, scheduled, recurring &amp; batch jobs across all queues.</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!canManage || allQueues.length === 0}><Plus size={15} /> New job</Button>
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[180px] flex-1">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
          <Input className="pl-8" placeholder="Search job name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select className="w-40" value={queueId} onChange={(e) => { setQueueId(e.target.value); setPage(1); }}>
          <option value="">All queues</option>
          {allQueues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
        </Select>
        <Select className="w-40" value={status} onChange={(e) => { setStatus(e.target.value as JobStatus | ""); setPage(1); }}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select className="w-36" value={type} onChange={(e) => { setType(e.target.value as JobType | ""); setPage(1); }}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500">
              <th className="cursor-pointer px-4 py-2.5" onClick={() => toggleSort("name")}>Name</th>
              <th className="px-4 py-2.5">Queue</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="cursor-pointer px-4 py-2.5" onClick={() => toggleSort("status")}>Status</th>
              <th className="px-4 py-2.5">Attempts</th>
              <th className="cursor-pointer px-4 py-2.5" onClick={() => toggleSort("createdAt")}>Created</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {scoped.data.map((j) => {
              const queue = engine.queues.find((q) => q.id === j.queueId);
              return (
                <tr key={j.id} className="border-b border-slate-900 hover:bg-slate-900/40">
                  <td className="px-4 py-2.5"><Link to={`/jobs/${j.id}`} className="font-medium text-slate-200 hover:text-indigo-300">{j.name}</Link></td>
                  <td className="px-4 py-2.5 text-slate-400">{queue?.name}</td>
                  <td className="px-4 py-2.5"><Badge>{j.type}</Badge></td>
                  <td className="px-4 py-2.5"><Badge tone={statusTone(j.status)}>{j.status}</Badge></td>
                  <td className="px-4 py-2.5 text-slate-400">{j.attempts}/{j.maxAttempts}</td>
                  <td className="px-4 py-2.5 text-slate-500">{new Date(j.createdAt).toLocaleTimeString()}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      {(j.status === "FAILED" || j.status === "DEAD_LETTER") && (
                        <button disabled={!canManage} onClick={() => engine.retryJob(j.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-emerald-400 disabled:opacity-30" title="Retry">
                          <RotateCcw size={14} />
                        </button>
                      )}
                      <button disabled={!canManage} onClick={() => engine.deleteJob(j.id).catch((e) => alert(e.message))} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400 disabled:opacity-30" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {scoped.data.length === 0 && (
              <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-500">No jobs match the current filters.</td></tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2.5 text-xs text-slate-500">
          <span>{scoped.total} total job{scoped.total === 1 ? "" : "s"} · page {scoped.page} of {scoped.totalPages}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></Button>
            <Button size="sm" variant="ghost" disabled={page >= scoped.totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></Button>
          </div>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Create job" wide>
        <form onSubmit={createJob}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Queue">
              <Select value={form.queueId} onChange={(e) => setForm({ ...form, queueId: e.target.value })}>
                {allQueues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </Select>
            </Field>
            <Field label="Job type">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as JobType })}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Job name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="send-invoice-email" /></Field>

          {(form.type === "DELAYED" || form.type === "SCHEDULED") && (
            <Field label={form.type === "DELAYED" ? "Run at (delay)" : "Scheduled for"}>
              <Input type="datetime-local" value={form.runAt} onChange={(e) => setForm({ ...form, runAt: e.target.value })} />
            </Field>
          )}
          {form.type === "RECURRING" && (
            <Field label="Cron expression (seconds-based demo, e.g. */30 * * * * *)">
              <Input value={form.cronExpression} onChange={(e) => setForm({ ...form, cronExpression: e.target.value })} />
            </Field>
          )}
          {form.type === "BATCH" && (
            <Field label="Batch size"><Input type="number" min={1} max={50} value={form.batchSize} onChange={(e) => setForm({ ...form, batchSize: Number(e.target.value) })} /></Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority (1-10)"><Input type="number" min={1} max={10} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></Field>
            <Field label="Max attempts"><Input type="number" min={1} max={10} value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Payload (JSON) — durationMs controls simulated execution time">
            <Textarea rows={4} className="font-mono" value={form.payload} onChange={(e) => setForm({ ...form, payload: e.target.value })} />
          </Field>
          <label className="mb-3 flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={form.forceFail} onChange={(e) => setForm({ ...form, forceFail: e.target.checked })} />
            Force this job to always fail (demonstrates retries → Dead Letter Queue)
          </label>
          <Button type="submit" className="w-full">Create job</Button>
        </form>
      </Modal>
    </div>
  );
}
