import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { clsx } from "clsx";

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm shadow-sm", className)} {...rest}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, accent = "indigo", icon }: { label: string; value: ReactNode; sub?: string; accent?: "indigo" | "emerald" | "rose" | "amber" | "sky"; icon?: ReactNode }) {
  const accents: Record<string, string> = {
    indigo: "from-indigo-500/20 to-indigo-500/0 text-indigo-300",
    emerald: "from-emerald-500/20 to-emerald-500/0 text-emerald-300",
    rose: "from-rose-500/20 to-rose-500/0 text-rose-300",
    amber: "from-amber-500/20 to-amber-500/0 text-amber-300",
    sky: "from-sky-500/20 to-sky-500/0 text-sky-300",
  };
  return (
    <Card className={clsx("relative overflow-hidden p-4")}>
      <div className={clsx("pointer-events-none absolute inset-0 bg-gradient-to-br", accents[accent])} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-50">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        {icon && <div className={clsx("rounded-lg bg-slate-800/70 p-2", accents[accent])}>{icon}</div>}
      </div>
    </Card>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "emerald" | "rose" | "amber" | "sky" | "indigo" | "violet" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-800 text-slate-300 border-slate-700",
    emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    rose: "bg-rose-500/10 text-rose-300 border-rose-500/30",
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    sky: "bg-sky-500/10 text-sky-300 border-sky-500/30",
    indigo: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
    violet: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  };
  return <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone])}>{children}</span>;
}

export function statusTone(status: string): "slate" | "emerald" | "rose" | "amber" | "sky" | "indigo" | "violet" {
  switch (status) {
    case "COMPLETED": return "emerald";
    case "FAILED": return "rose";
    case "DEAD_LETTER": return "rose";
    case "RUNNING": return "sky";
    case "CLAIMED": return "indigo";
    case "RETRYING": return "amber";
    case "SCHEDULED": return "violet";
    case "CANCELLED": return "slate";
    default: return "slate";
  }
}

export function Button({ className, variant = "primary", size = "md", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; size?: "sm" | "md" }) {
  const variants: Record<string, string> = {
    primary: "bg-indigo-600 hover:bg-indigo-500 text-white shadow shadow-indigo-900/40",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700",
    danger: "bg-rose-600/90 hover:bg-rose-600 text-white",
    ghost: "bg-transparent hover:bg-slate-800 text-slate-300",
  };
  const sizes: Record<string, string> = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm" };
  return (
    <button
      className={clsx("inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-40", variants[variant], sizes[size], className)}
      {...rest}
    />
  );
}

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx("w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500", className)} {...rest} />;
}

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx("w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx("w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500", className)} {...rest} />;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className={clsx("max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl", wide ? "max-w-2xl" : "max-w-md")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export function ProgressBar({ value, tone = "indigo" }: { value: number; tone?: "indigo" | "emerald" | "rose" | "amber" | "sky" }) {
  const tones: Record<string, string> = { indigo: "bg-indigo-500", emerald: "bg-emerald-500", rose: "bg-rose-500", amber: "bg-amber-500", sky: "bg-sky-500" };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div className={clsx("h-full rounded-full transition-all", tones[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
