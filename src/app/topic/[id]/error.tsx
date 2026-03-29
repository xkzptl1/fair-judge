"use client";

import Link from "next/link";
import { useEffect } from "react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: Props) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
      >
        ← トピック一覧に戻る
      </Link>

      <div className="mt-12 text-center">
        <p className="text-sm text-slate-400">データの取得中に問題が発生しました。</p>
        <button
          onClick={reset}
          className="mt-4 rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
        >
          再試行する
        </button>
      </div>
    </main>
  );
}
