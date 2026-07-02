import { useState } from "react";
import { Link } from "react-router-dom";
import { ListOrdered, Pause, Play, Plus, Settings2 } from "lucide-react";
import { engine } from "../lib/engine";
import { useLive } from "../hooks/useLive";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Modal, Field, Input, Select, Textarea, Badge, ProgressBar } from "../components/ui";

export default function Queues() {
  useLive(["state:sync", "queue:paused", "queue:resumed", "queue:updated"]);
  const { currentOrgId, can } = useAuth();
  const canManage = can(["ADMIN", "DEVELOPER"]);
  const [open, setOpen] = useState(false);
  const projects = currentOrgId ? engine.listProjects(currentOrgId) : [];
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [form, setForm] = useState({ name: "", description: "", priority: 5, concurrencyLimit: 2, retryPolicyId: engine.retryPolicies[0]?.id ?? "" });

  const effectiveProjectId = projectId || projects[0]?.id;
  const queues = effectiveProjectId ? engine.listQueues(effectiveProjectId) : [];

  async function createQueue(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveProjectId || !form.name.trim()) return;
    await engine.createQueue({ projectId: effectiveProjectId, name: form.name.trim(), description: form.description, priority: Number(form.priority), concurrencyLimit: Number(form.concurrencyLimit), retryPolicyId: form.retryPolicyId });
    setForm({ name: "", description: "", priority: 5, concurrencyLimit: 2, retryPolicyId: engine.retryPolicies[0]?.id ?? "" });
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Queues</h1>
          <p className="text-sm text-slate-500">Priority, concurrency, retry policy and pause controls per queue.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select className="w-52" value={effectiveProjectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Button onClick={() => setOpen(true)} disabled={!canManage || !effectiveProjectId}><Plus size={15} /> New queue</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {queues.map((q) => {
          const policy = engine.retryPolicies.find((p) => p.id === q.retryPolicyId);
          const capacityUsed = q.stats.running / Math.max(1, q.concurrencyLimit) * 100;
          return (
            <Card key={q.id} className="p-4">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300"><ListOrdered size={16} /></div>
                  <div>
                    <Link to={`/queues/${q.id}`} className="text-sm font-semibold text-slate-100 hover:text-indigo-300">{q.name}</Link>
                    <p className="text-xs text-slate-500">priority {q.priority} · concurrency {q.concurrencyLimit}</p>
                  </div>
                </div>
                <Badge tone={q.isPaused ? "amber" : "emerald"}>{q.isPaused ? "Paused" : "Active"}</Badge>
              </div>
              <p className="mb-3 line-clamp-2 text-xs text-slate-500">{q.description || "No description"}</p>

              <div className="mb-3 space-y-1">
                <div className="flex justify-between text-[11px] text-slate-500"><span>Concurrency usage</span><span>{q.stats.running}/{q.concurrencyLimit}</span></div>
                <ProgressBar value={capacityUsed} tone="sky" />
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div><p className="font-semibold text-slate-200">{q.stats.queued}</p><p className="text-slate-500">Queued</p></div>
                <div><p className="font-semibold text-emerald-300">{q.stats.completed}</p><p className="text-slate-500">Done</p></div>
                <div><p className="font-semibold text-rose-300">{q.stats.failed}</p><p className="text-slate-500">Failed</p></div>
                <div><p className="font-semibold text-slate-200">{q.stats.successRate}%</p><p className="text-slate-500">Success</p></div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
                <span className="text-[11px] text-slate-500">Retry: {policy?.name}</span>
                <div className="flex gap-1.5">
                  {q.isPaused ? (
                    <Button size="sm" variant="secondary" disabled={!canManage} onClick={() => engine.resumeQueue(q.id)}><Play size={13} /> Resume</Button>
                  ) : (
                    <Button size="sm" variant="secondary" disabled={!canManage} onClick={() => engine.pauseQueue(q.id)}><Pause size={13} /> Pause</Button>
                  )}
                  <Link to={`/queues/${q.id}`}><Button size="sm" variant="ghost"><Settings2 size={13} /></Button></Link>
                </div>
              </div>
            </Card>
          );
        })}
        {queues.length === 0 && <p className="text-sm text-slate-500">No queues in this project yet.</p>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create queue">
        <form onSubmit={createQueue}>
          <Field label="Queue name"><Input autoFocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="payments" /></Field>
          <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority (1-10)"><Input type="number" min={1} max={10} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></Field>
            <Field label="Concurrency limit"><Input type="number" min={1} max={20} value={form.concurrencyLimit} onChange={(e) => setForm({ ...form, concurrencyLimit: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Retry policy">
            <Select value={form.retryPolicyId} onChange={(e) => setForm({ ...form, retryPolicyId: e.target.value })}>
              {engine.retryPolicies.map((p) => <option key={p.id} value={p.id}>{p.name} (max {p.maxAttempts})</option>)}
            </Select>
          </Field>
          <Button type="submit" className="w-full">Create queue</Button>
        </form>
      </Modal>
    </div>
  );
}
