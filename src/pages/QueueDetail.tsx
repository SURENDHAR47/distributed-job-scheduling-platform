import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pause, Play, Save } from "lucide-react";
import { engine } from "../lib/engine";
import { useLive } from "../hooks/useLive";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Field, Input, Select, Badge, StatCard } from "../components/ui";

export default function QueueDetail() {
  useLive(["state:sync", "queue:updated", "queue:paused", "queue:resumed"]);
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can(["ADMIN", "DEVELOPER"]);
  const queue = engine.queues.find((q) => q.id === id);
  const [edited, setEdited] = useState(false);
  const [form, setForm] = useState(() => queue ? { name: queue.name, description: queue.description, priority: queue.priority, concurrencyLimit: queue.concurrencyLimit, retryPolicyId: queue.retryPolicyId } : null);

  if (!queue || !form) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/queues")}><ArrowLeft size={14} /> Back</Button>
        <p className="text-sm text-slate-500">Queue not found.</p>
      </div>
    );
  }

  const stats = engine.queueStats(queue.id);
  const jobs = engine.jobs.filter((j) => j.queueId === queue.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);

  async function save() {
    await engine.updateQueue(queue!.id, form!);
    setEdited(false);
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/queues")}><ArrowLeft size={14} /> Back to queues</Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-50">{queue.name} <Badge tone={queue.isPaused ? "amber" : "emerald"}>{queue.isPaused ? "Paused" : "Active"}</Badge></h1>
          <p className="text-sm text-slate-500">{queue.description}</p>
        </div>
        {queue.isPaused ? (
          <Button disabled={!canManage} onClick={() => engine.resumeQueue(queue.id)}><Play size={15} /> Resume queue</Button>
        ) : (
          <Button variant="secondary" disabled={!canManage} onClick={() => engine.pauseQueue(queue.id)}><Pause size={15} /> Pause queue</Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Queued" value={stats.queued} accent="sky" />
        <StatCard label="Running" value={stats.running} accent="indigo" />
        <StatCard label="Success rate" value={`${stats.successRate}%`} accent="emerald" />
        <StatCard label="Retry rate" value={`${stats.retryRate}%`} accent="amber" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Configuration</h2>
          <Field label="Name"><Input value={form.name} disabled={!canManage} onChange={(e) => { setForm({ ...form, name: e.target.value }); setEdited(true); }} /></Field>
          <Field label="Description"><Input value={form.description} disabled={!canManage} onChange={(e) => { setForm({ ...form, description: e.target.value }); setEdited(true); }} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority"><Input type="number" min={1} max={10} value={form.priority} disabled={!canManage} onChange={(e) => { setForm({ ...form, priority: Number(e.target.value) }); setEdited(true); }} /></Field>
            <Field label="Concurrency"><Input type="number" min={1} max={20} value={form.concurrencyLimit} disabled={!canManage} onChange={(e) => { setForm({ ...form, concurrencyLimit: Number(e.target.value) }); setEdited(true); }} /></Field>
          </div>
          <Field label="Retry policy">
            <Select value={form.retryPolicyId} disabled={!canManage} onChange={(e) => { setForm({ ...form, retryPolicyId: e.target.value }); setEdited(true); }}>
              {engine.retryPolicies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Button className="w-full" disabled={!edited || !canManage} onClick={save}><Save size={14} /> Save changes</Button>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Recent jobs in this queue</h2>
          <div className="space-y-2">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm">
                <div>
                  <p className="text-slate-200">{j.name}</p>
                  <p className="text-xs text-slate-500">{j.type} · attempts {j.attempts}/{j.maxAttempts}</p>
                </div>
                <Badge tone={j.status === "COMPLETED" ? "emerald" : j.status === "DEAD_LETTER" || j.status === "FAILED" ? "rose" : "sky"}>{j.status}</Badge>
              </div>
            ))}
            {jobs.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No jobs yet in this queue.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
