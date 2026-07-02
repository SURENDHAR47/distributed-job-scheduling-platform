import { Activity, AlertTriangle, CheckCircle2, Cpu, Gauge, ListTodo, RefreshCcw, Skull, Zap } from "lucide-react";
import { engine } from "../lib/engine";
import { useLive } from "../hooks/useLive";
import { Card, StatCard, Badge, statusTone } from "../components/ui";
import { Sparkline, BarPair, Donut } from "../components/Charts";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";

export default function Dashboard() {
  useLive(["state:sync"]);
  const { currentOrgId } = useAuth();
  const metrics = engine.metrics();
  const series = engine.throughputSeries(20);
  const projects = currentOrgId ? engine.listProjects(currentOrgId) : [];
  const projectIds = new Set(projects.map((p) => p.id));
  const queues = engine.listQueues().filter((q) => projectIds.has(q.projectId));
  const runningJobs = engine.jobs.filter((j) => queues.some((q) => q.id === j.queueId) && (j.status === "RUNNING" || j.status === "CLAIMED")).slice(0, 6);
  const recentFailures = engine.jobs
    .filter((j) => queues.some((q) => q.id === j.queueId) && (j.status === "FAILED" || j.status === "DEAD_LETTER"))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Overview</h1>
          <p className="text-sm text-slate-500">Live metrics streamed over the realtime channel.</p>
        </div>
        <Badge tone="emerald"><Activity size={12} /> Live</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Running Jobs" value={metrics.runningJobs} accent="sky" icon={<Zap size={16} />} />
        <StatCard label="Success Rate" value={`${metrics.successRate}%`} accent="emerald" icon={<CheckCircle2 size={16} />} />
        <StatCard label="Retry Rate" value={`${metrics.retryRate}%`} accent="amber" icon={<RefreshCcw size={16} />} />
        <StatCard label="Dead Letter" value={metrics.deadLetterJobs} accent="rose" icon={<Skull size={16} />} />
        <StatCard label="Active Workers" value={`${metrics.activeWorkers}/${metrics.totalWorkers}`} accent="indigo" icon={<Cpu size={16} />} />
        <StatCard label="Worker Utilization" value={`${metrics.workerUtilization}%`} accent="indigo" icon={<Gauge size={16} />} />
        <StatCard label="Avg Exec Time" value={`${metrics.avgExecutionTimeMs}ms`} accent="sky" icon={<Activity size={16} />} />
        <StatCard label="Throughput /min" value={metrics.throughputPerMin} accent="emerald" icon={<ListTodo size={16} />} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Throughput (last 20 min)</h2>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500/80" /> completed</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-500/70" /> failed</span>
            </div>
          </div>
          <BarPair data={series} />
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Job outcome mix</h2>
          <Donut
            segments={[
              { value: metrics.completedJobs, color: "#10b981", label: "Completed" },
              { value: metrics.failedJobs, color: "#f59e0b", label: "Failed (retrying)" },
              { value: metrics.deadLetterJobs, color: "#f43f5e", label: "Dead letter" },
              { value: metrics.runningJobs, color: "#38bdf8", label: "Running" },
            ]}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Running now</h2>
            <Link to="/jobs" className="text-xs text-indigo-400 hover:text-indigo-300">View all jobs →</Link>
          </div>
          {runningJobs.length === 0 && <p className="py-8 text-center text-xs text-slate-500">No jobs currently executing.</p>}
          <div className="space-y-2">
            {runningJobs.map((j) => {
              const worker = engine.workers.find((w) => w.id === j.claimedBy);
              return (
                <div key={j.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <div>
                    <p className="text-sm text-slate-200">{j.name}</p>
                    <p className="text-xs text-slate-500">{worker?.name ?? "unassigned"} · attempt {j.attempts}/{j.maxAttempts}</p>
                  </div>
                  <Badge tone={statusTone(j.status)}>{j.status}</Badge>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Recent failures</h2>
            <Link to="/dlq" className="text-xs text-indigo-400 hover:text-indigo-300">View DLQ →</Link>
          </div>
          {recentFailures.length === 0 && <p className="py-8 text-center text-xs text-slate-500">No recent failures. All systems nominal.</p>}
          <div className="space-y-2">
            {recentFailures.map((j) => (
              <div key={j.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-200">{j.name}</p>
                  <p className="truncate text-xs text-slate-500">{j.lastError}</p>
                </div>
                <Badge tone={statusTone(j.status)}><AlertTriangle size={11} />{j.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Queue snapshot</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Queue</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Running</th>
                <th className="py-2 pr-4">Queued</th>
                <th className="py-2 pr-4">Success</th>
                <th className="py-2 pr-4">Throughput</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((q) => (
                <tr key={q.id} className="border-b border-slate-900">
                  <td className="py-2 pr-4 font-medium text-slate-200">{q.name}</td>
                  <td className="py-2 pr-4"><Badge tone={q.isPaused ? "amber" : "emerald"}>{q.isPaused ? "Paused" : "Active"}</Badge></td>
                  <td className="py-2 pr-4">{q.stats.running}</td>
                  <td className="py-2 pr-4">{q.stats.queued}</td>
                  <td className="py-2 pr-4">{q.stats.successRate}%</td>
                  <td className="py-2 pr-4"><Sparkline data={[2, 4, 3, 6, q.stats.throughputPerMin, q.stats.throughputPerMin + 1]} width={90} height={28} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
