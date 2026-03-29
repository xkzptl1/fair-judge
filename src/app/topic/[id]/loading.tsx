export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      {/* Back link skeleton */}
      <div className="mb-6 h-4 w-28 rounded bg-slate-800 animate-pulse" />

      {/* Title */}
      <div className="mb-2 h-7 w-4/5 rounded bg-slate-800 animate-pulse" />
      {/* Summary */}
      <div className="mb-1 h-4 w-full rounded bg-slate-800 animate-pulse" />
      <div className="mb-6 h-4 w-3/4 rounded bg-slate-800 animate-pulse" />

      {/* Stance bar */}
      <div className="mb-2 h-4 w-20 rounded bg-slate-800 animate-pulse" />
      <div className="mb-6 h-3 w-full rounded bg-slate-800 animate-pulse" />

      {/* Issues card */}
      <div className="mb-8 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3 h-4 w-24 rounded bg-slate-800 animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="mb-2 h-3 w-full rounded bg-slate-800 animate-pulse" />
        ))}
      </div>

      {/* Tabs skeleton */}
      <div className="mb-4 h-4 w-28 rounded bg-slate-800 animate-pulse" />
      <div className="mb-6 flex gap-2 border-b border-slate-800 pb-3">
        {[64, 80, 56].map((w, i) => (
          <div key={i} className="h-7 rounded-full bg-slate-800 animate-pulse" style={{ width: `${w}px` }} />
        ))}
      </div>

      {/* Article skeletons */}
      <ul className="space-y-4">
        {[0, 1].map((i) => (
          <li key={i}>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
              <div className="mb-1.5 h-3 w-20 rounded bg-slate-800 animate-pulse" />
              <div className="mb-2 h-4 w-full rounded bg-slate-800 animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-slate-800 animate-pulse" />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
