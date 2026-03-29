export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <div className="h-6 w-40 rounded bg-slate-800 animate-pulse" />
        <div className="mt-1 h-4 w-64 rounded bg-slate-800 animate-pulse" />
      </header>

      {/* Filter strip skeleton */}
      <div className="mb-6 flex gap-2">
        {[48, 72, 40, 48].map((w, i) => (
          <div
            key={i}
            className="h-7 rounded-full bg-slate-800 animate-pulse shrink-0"
            style={{ width: `${w}px` }}
          />
        ))}
      </div>

      {/* Topic card skeletons */}
      <ul className="space-y-4">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-3 h-5 w-3/4 rounded bg-slate-800 animate-pulse" />
              <div className="mb-1 h-4 w-full rounded bg-slate-800 animate-pulse" />
              <div className="mb-4 h-4 w-2/3 rounded bg-slate-800 animate-pulse" />
              <div className="mb-4 h-3 w-full rounded bg-slate-800 animate-pulse" />
              <div className="flex gap-3">
                <div className="h-3 w-16 rounded bg-slate-800 animate-pulse" />
                <div className="h-3 w-12 rounded bg-slate-800 animate-pulse" />
                <div className="ml-auto h-3 w-10 rounded bg-slate-800 animate-pulse" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
