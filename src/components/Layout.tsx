import { type ReactNode, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Building2, FolderKanban, ListOrdered, ListTodo, Cpu, ScrollText,
  Trash2, LogOut, ChevronDown, Radio, Bell,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { engine } from "../lib/engine";
import { useLive, useRealtimeFeed } from "../hooks/useLive";
import { Badge } from "./ui";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/organizations", label: "Organizations", icon: Building2 },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/queues", label: "Queues", icon: ListOrdered },
  { to: "/jobs", label: "Jobs", icon: ListTodo },
  { to: "/workers", label: "Workers", icon: Cpu },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/dlq", label: "Dead Letter Queue", icon: Trash2 },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, currentOrgId, setCurrentOrgId, roleInOrg } = useAuth();
  const navigate = useNavigate();
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  useLive(["worker:online", "worker:offline"]);
  const feed = useRealtimeFeed();

  const orgs = user ? engine.listOrganizations(user.id) : [];
  const currentOrg = orgs.find((o) => o.id === currentOrgId) ?? orgs[0];
  const role = currentOrg ? roleInOrg(currentOrg.id) : null;
  const onlineWorkers = engine.workers.filter((w) => w.status !== "OFFLINE").length;

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950/80 px-4 py-5">
        <div className="mb-6 flex items-center gap-2 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow shadow-indigo-900/50">
            <Radio size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-slate-50">Pulsar</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Job Scheduling Platform</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? "bg-indigo-500/15 text-indigo-300" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                }`
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
          <div className="flex items-center justify-between">
            <span>Worker fleet</span>
            <Badge tone={onlineWorkers > 0 ? "emerald" : "rose"}>{onlineWorkers} online</Badge>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 backdrop-blur">
          <div className="relative">
            {currentOrg && (
              <button onClick={() => setOrgMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-700">
                <Building2 size={14} className="text-slate-400" />
                {currentOrg.name}
                <ChevronDown size={14} className="text-slate-500" />
              </button>
            )}
            {orgMenuOpen && (
              <div className="absolute left-0 top-11 z-20 w-56 rounded-lg border border-slate-800 bg-slate-900 p-1 shadow-xl">
                {orgs.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => { setCurrentOrgId(o.id); setOrgMenuOpen(false); }}
                    className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800"
                  >
                    {o.name}
                    <Badge tone="indigo">{o.role}</Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button onClick={() => setFeedOpen((v) => !v)} className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-slate-200">
                <Bell size={18} />
                {feed.length > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
              </button>
              {feedOpen && (
                <div className="absolute right-0 top-11 z-20 max-h-96 w-80 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 p-2 shadow-xl">
                  <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Realtime activity</p>
                  {feed.length === 0 && <p className="px-2 py-4 text-center text-xs text-slate-500">No events yet</p>}
                  {feed.map((f) => (
                    <div key={f.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-800">
                      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                        f.kind === "success" ? "bg-emerald-400" : f.kind === "error" ? "bg-rose-400" : f.kind === "warning" ? "bg-amber-400" : "bg-sky-400"
                      }`} />
                      <span className="text-slate-300">{f.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="h-6 w-px bg-slate-800" />
            <div className="text-right">
              <p className="text-sm font-medium leading-tight text-slate-200">{user?.name}</p>
              <p className="text-[11px] leading-tight text-slate-500">{role ?? "—"}</p>
            </div>
            <button onClick={() => { logout(); navigate("/login"); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-rose-400" title="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
