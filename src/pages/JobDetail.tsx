import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { engine } from "../lib/engine";
import { useLive } from "../hooks/useLive";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Badge, statusTone } from "../components/ui";

export default function JobDetail() {
  useLive(["state:sync"]);
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can(["ADMIN", "DEVELOPER"]);
  const job = id ? engine.jobs.find((j) => j.id === id) : undefined;

  if (!job) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/jobs")}><ArrowLeft size={14} /> Back</Button>
        <p className="text-sm text-slate-500">Job not found (it may have been deleted).</p>
      </div>
    );
  }

  const queue = engine.queues.find((q) => q.id === job.queueId);
  const executions = engine.getJobExecutions(job.id);
  const logs = engine.getJobLogs(job.id);

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/jobs")}><ArrowLeft size={14} /> Back to jobs</Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-50">{job.name} <Badge tone={statusTone(job.status)}>{job.status}</Badge></h1>
          <p className="text-sm text-slate-500">Queue: {queue?.name} · Type: {job.type} · Priority {job.priority}</p>
        </div>
        <div className="flex gap-2">
          {(job.status === "FAILED" || job.status === "DEAD_LETTER") && (
            <Button disabled={!canManage} onClick={() => engine.retryJob(job.id)}><RotateCcw size={14} /> Retry job</Button>
          )}
          <Button variant="danger" disabled={!canManage} onClick={() => engine.deleteJob(job.id).then(() => navigate("/jobs")).catch((e) => alert(e.message))}><Trash2 size={14} /> Delete</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-3"><p className="text-xs text-slate-500">Attempts</p><p className="text-lg font-semibold text-slate-100">{job.attempts}/{job.maxAttempts}</p></Card>
        <Card className="p-3"><p className="text-xs text-slate-500">Duration</p><p className="text-lg font-semibold text-slate-100">{job.durationMs ? `${job.durationMs}ms` : "—"}</p></Card>
        <Card className="p-3"><p className="text-xs text-slate-500">Run at</p><p className="text-sm font-medium text-slate-100">{new Date(job.runAt).toLocaleString()}</p></Card>
        <Card className="p-3"><p className="text-xs text-slate-500">Created</p><p className="text-sm font-medium text-slate-100">{new Date(job.createdAt).toLocaleString()}</p></Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Payload</h2>
        <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">{JSON.stringify(job.payload, null, 2)}</pre>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Execution history</h2>
        <div className="space-y-2">
          {executions.map((e) => {
            const worker = engine.workers.find((w) => w.id === e.workerId);
            return (
              <div key={e.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-200">Attempt {e.attemptNumber} · {worker?.name ?? "unknown worker"}</p>
                  <Badge tone={e.status === "COMPLETED" ? "emerald" : e.status === "FAILED" ? "rose" : "sky"}>{e.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Start {new Date(e.startedAt).toLocaleTimeString()} {e.completedAt && `· End ${new Date(e.completedAt).toLocaleTimeString()}`} {e.durationMs != null && `· ${e.durationMs}ms`}
                </p>
                {e.errorMessage && <p className="mt-1 text-xs text-rose-300">{e.errorMessage}</p>}
                {e.errorStack && <pre className="mt-2 overflow-x-auto rounded-md bg-slate-950 p-2 text-[11px] text-slate-500">{e.errorStack}</pre>}
              </div>
            );
          })}
          {executions.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No executions recorded yet — waiting for a worker to claim this job.</p>}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Logs</h2>
        <div className="max-h-72 space-y-1 overflow-y-auto font-mono text-xs">
          {logs.map((l) => (
            <div key={l.id} className="flex gap-2">
              <span className="shrink-0 text-slate-600">{new Date(l.timestamp).toLocaleTimeString()}</span>
              <span className={`shrink-0 uppercase ${l.level === "error" ? "text-rose-400" : l.level === "warn" ? "text-amber-400" : "text-sky-400"}`}>{l.level}</span>
              <span className="text-slate-300">{l.message}</span>
            </div>
          ))}
          {logs.length === 0 && <p className="py-6 text-center text-slate-500">No log entries yet.</p>}
        </div>
      </Card>
    </div>
  );
}
