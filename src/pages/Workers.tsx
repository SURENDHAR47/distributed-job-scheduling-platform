import { Cpu, Plus } from "lucide-react";
import { engine } from "../lib/engine";
import { useLive } from "../hooks/useLive";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Badge, ProgressBar } from "../components/ui";

export default function Workers() {
  useLive(["state:sync", "worker:online", "worker:offline", "worker:heartbeat"]);
  const { can } = useAuth();
  const canManage = can(["ADMIN", "DEVELOPER"]);
  const workers = engine.workers;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Workers</h1>
          <p className="text-sm text-slate-500">Fleet health, heartbeats, and active job claims (SELECT … FOR UPDATE SKIP LOCKED).</p>
        </div>
        <Button disabled={!canManage} onClick={() => engine.registerWorker(`worker-${workers.length + 1}`, 2)}><Plus size={15} /> Spin up worker</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workers.map((w) => {
          const jobs = w.activeJobIds.map((id) => engine.jobs.find((j) => j.id === id)).filter(Boolean);
          const secondsSinceHeartbeat = Math.round((Date.now() - new Date(w.lastHeartbeatAt).getTime()) / 1000);
          return (
            <Card key={w.id} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${w.status === "OFFLINE" ? "bg-rose-500/10 text-rose-300" : "bg-indigo-500/10 text-indigo-300"}`}><Cpu size={16} /></div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{w.name}</p>
                    <p className="text-xs text-slate-500">{w.hostname}</p>
                  </div>
                </div>
                <Badge tone={w.status === "ONLINE" ? "emerald" : w.status === "BUSY" ? "sky" : "rose"}>{w.status}</Badge>
              </div>

              <div className="mb-3 space-y-2">
                <div>
                  <div className="mb-1 flex justify-between text-[11px] text-slate-500"><span>CPU</span><span>{w.cpuUsage}%</span></div>
                  <ProgressBar value={w.cpuUsage} tone={w.cpuUsage > 80 ? "rose" : "indigo"} />
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-[11px] text-slate-500"><span>Memory</span><span>{w.memoryUsage}%</span></div>
                  <ProgressBar value={w.memoryUsage} tone="sky" />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Concurrency {w.activeJobIds.length}/{w.concurrency}</span>
                <span>{w.status === "OFFLINE" ? "unreachable" : `heartbeat ${secondsSinceHeartbeat}s ago`}</span>
              </div>

              {jobs.length > 0 && (
                <div className="mt-3 space-y-1 border-t border-slate-800 pt-2">
                  {jobs.map((j) => j && <p key={j.id} className="truncate text-xs text-slate-400">▸ {j.name}</p>)}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
