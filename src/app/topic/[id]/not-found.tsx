import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
      >
        ← トピック一覧に戻る
      </Link>

      <div className="mt-12 text-center">
        <p className="text-sm text-slate-400">このトピックは見つかりませんでした。</p>
        <p className="mt-1 text-xs text-slate-600">削除されたか、URLが正しくない可能性があります。</p>
      </div>
    </main>
  );
}
