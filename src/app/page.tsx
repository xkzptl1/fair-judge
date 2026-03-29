import { getTopics } from "@/lib/queries";
import { TopicListWithFilter } from "@/components/TopicListWithFilter";

export const dynamic = "force-dynamic";

export default async function Home() {
  const topics = await getTopics();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-slate-100">Fair Judge</h1>
        <p className="mt-1 text-sm text-slate-500">
          同じ話題が、異なるメディアでどう語られているかを可視化します
        </p>
      </header>

      {topics.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-400">現在表示できるトピックはありません。</p>
          <p className="text-xs text-slate-600">
            ニュースの収集・分析には少し時間がかかります。しばらく後にもう一度ご確認ください。
          </p>
        </div>
      ) : (
        <TopicListWithFilter topics={topics} />
      )}
    </main>
  );
}
