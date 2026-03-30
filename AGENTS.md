# Agent Instructions

- `npx` や `npm` が見つからない、またはエラーが発生した場合は、代わりに `bun` を使用してください。
- 例: `npx http-server` -> `bun x http-server`
- 本プロジェクトは Firebase Hosting にデプロイされます。
- デプロイ先のプロジェクト名は `museum-6f112` です。
- 本番公開用ブランチは `museum-portal` です。
- GitHub Actions を使用して、`museum-portal` ブランチへのプッシュ時に自動的に Firebase Hosting へデプロイされます。
- デプロイには `FIREBASE_TOKEN` シークレットが必要です。
- ローカルからの手動デプロイには `bun x firebase deploy` を使用してください。
- カノニカルドメインは `https://museum-portal.moukaeritai.work` です。
