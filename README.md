# Fair Judge

同じ話題が、異なるメディアでどう語られているかを可視化するニュース探索アプリ。

## 概要

Fair Judge はトピックを起点に、複数の報道機関がどのような立場でそれを報じているかを可視化します。記事を読む前に全体像を把握することを優先しています。

## ローカル開発

```bash
# 依存インストール
npm install

# 環境変数を設定
cp .env.example .env.local
# .env.local を編集して実際の値を入力

# 開発サーバー起動
npm run dev
```

## 環境変数

`.env.example` を参照してください。本番では以下がすべて必須です：

| 変数名 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | クライアント向け anon キー |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバーサイド書き込み用（RLS バイパス） |
| `ANTHROPIC_API_KEY` | エンリッチメント LLM |
| `CRON_SECRET` | パイプライントリガー保護 |
| `ADMIN_SECRET` | 管理画面保護 |

## パイプライン

```
/api/discover/trigger           記事収集・クラスタリング
/api/discover/enrich/trigger    LLM エンリッチメント + 評価
/api/discover/age-topics/trigger トピック鮮度チェック + 自動昇格
```

Vercel Cron で毎時自動実行（`vercel.json` 参照）。
ローカル確認: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/discover/trigger`

## 管理画面

`/admin/candidates` — 候補トピックのレビュー・昇格操作。
Basic Auth: ユーザー名は任意、パスワードは `ADMIN_SECRET`。

## デプロイ (Vercel)

1. このリポジトリを Vercel にインポート
2. 上記の環境変数をすべて設定
3. `CRON_SECRET` を設定すると Vercel がクロンリクエストに自動付与
4. デプロイ後、`/api/discover/trigger` を手動で一度呼び出してパイプラインを初期化
