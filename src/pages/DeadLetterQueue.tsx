import { Link } from "react-router-dom";
import { RotateCcw, Skull } from "lucide-react";
import { engine } from "../lib/engine";
import { useLive } from "../hooks/useLive";
import { useAuth } from "../context/AuthContext";
import { Card, Badge, EmptyState } from "../components/ui";

export default function DeadLetterQueue() {
  useLive(["state:sync", "job:dead_letter"]);
  const { can } = useAuth();
  const canManage = can(["ADMIN", "DEVELOPER"]);
  const entries = engine.listDeadLetter();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-50"><Skull size={20} className="text-rose-400" /> Dead Letter Queue</h1>
          <p className="text-sm text-slate-500">Jobs that exhausted all retry attempts under their queue's retry policy.</p>
        </div>
        <Badge tone="rose">{entries.length} entries</Badge>
      </div>

      <Card className="overflow-hidden">
        {entries.length === 0 ? (
          <EmptyState title="Dead letter queue is empty" sub="Failed jobs that exhaust retries will appear here." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Queue</th>
                <th className="px-4 py-2.5">Reason</th>
                <th className="px-4 py-2.5">Attempts</th>
                <th className="px-4 py-2.5">Failed at</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {entries.map((d) => {
                const job = engine.jobs.find((j) => j.id === d.jobId);
                const queue = engine.queues.find((q) => q.id === d.queueId);
                return (
                  <tr key={d.id} className="border-b border-slate-900">
                    <td className="px-4 py-2.5 text-slate-300">{queue?.name}</td>
                    <td className="px-4 py-2.5 text-rose-300">{d.reason}</td>
                    <td className="px-4 py-2.5 text-slate-400">{d.attemptsMade}</td>
                    <td className="px-4 py-2.5 text-slate-500">{new Date(d.failedAt).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        {job && <Link to={`/jobs/${job.id}`} className="text-xs text-indigo-400 hover:text-indigo-300">View job</Link>}
                        {job && (
                          <button disabled={!canManage} onClick={() => engine.retryJob(job.id)} className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-emerald-400 disabled:opacity-30" title="Retry">
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
