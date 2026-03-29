'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  candidateId: string;
  title:       string;
}

export function PromoteButton({ candidateId, title }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone]   = useState(false);

  async function handlePromote() {
    if (!confirm(`「${title}」をトピックに昇格しますか？`)) return;
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch('/api/discover/promote', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ candidateId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? '昇格に失敗しました');
        } else {
          setDone(true);
          router.refresh();
        }
      } catch (e) {
        setError(String(e));
      }
    });
  }

  if (done) {
    return (
      <span className="rounded-full bg-emerald-900/50 border border-emerald-700 px-2.5 py-0.5 text-xs text-emerald-300">
        昇格済
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handlePromote}
        disabled={isPending}
        className={
          'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
          (isPending
            ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
            : 'bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer')
        }
      >
        {isPending ? '処理中…' : 'トピックに昇格'}
      </button>
      {error && (
        <p className="text-xs text-rose-400">{error}</p>
      )}
    </div>
  );
}
