// Lightweight dependency-free SVG charts (avoids pulling a heavy chart library
// for a handful of dashboard visualizations).

export function Sparkline({ data, width = 280, height = 64, stroke = "#6366f1" }: { data: number[]; width?: number; height?: number; stroke?: string }) {
  if (data.length === 0) return <div style={{ width, height }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / Math.max(1, data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 6) - 3}`).join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polygon points={areaPoints} fill={stroke} opacity={0.08} />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BarPair({ data }: { data: { t: string; completed: number; failed: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.completed + d.failed));
  return (
    <div className="flex h-40 items-end gap-1.5">
      {data.map((d, i) => (
        <div key={i} className="group relative flex flex-1 flex-col items-center justify-end gap-0.5" title={`${d.t} — ${d.completed} completed, ${d.failed} failed`}>
          <div className="flex w-full flex-col items-center justify-end gap-0.5" style={{ height: "100%" }}>
            <div className="w-full rounded-t-sm bg-rose-500/70" style={{ height: `${(d.failed / max) * 100}%`, minHeight: d.failed ? 2 : 0 }} />
            <div className="w-full rounded-t-sm bg-emerald-500/80" style={{ height: `${(d.completed / max) * 100}%`, minHeight: d.completed ? 2 : 0 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Donut({ segments, size = 120, thickness = 16 }: { segments: { value: number; color: string; label: string }[]; size?: number; thickness?: number }) {
  const total = Math.max(1, segments.reduce((a, s) => a + s.value, 0));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e293b" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const length = (s.value / total) * circumference;
          const dash = `${length} ${circumference - length}`;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={s.color} strokeWidth={thickness}
              strokeDasharray={dash} strokeDashoffset={-offset} strokeLinecap="butt" />
          );
          offset += length;
          return el;
        })}
      </svg>
      <div className="space-y-1.5">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label} <span className="font-medium text-slate-200">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
