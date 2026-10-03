# Game List API

Cloudflare Workers 上で動作する、FastAPI 製の最小 Python バックエンドです。

## API

### `GET /api/hello`

レスポンス例:

```json
{
  "message": "Hello from Cloudflare Workers!"
}
```

## 前提環境

- Python 3.13 以上
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- [Node.js LTS](https://nodejs.org/)（Wrangler の実行に使用）
- Cloudflare アカウント（デプロイ時）

## ローカル起動

PowerShell でこのディレクトリへ移動します。

```powershell
cd C:\mywork\gamelist\api
uv run pywrangler dev
```

初回は依存パッケージの取得に時間がかかる場合があります。起動後、別の PowerShell から確認します。

```powershell
Invoke-RestMethod http://localhost:8787/api/hello
```

ブラウザーで `http://localhost:8787/api/hello` を開いても確認できます。終了するには起動中の PowerShell で `Ctrl+C` を押します。

## Cloudflare へ手動デプロイ

初回のみブラウザーで Cloudflare にログインします。

```powershell
uv run pywrangler login
```

デプロイします。

```powershell
uv run pywrangler deploy
```

表示された `https://...workers.dev` の末尾に `/api/hello` を付けて動作確認します。

Worker 名は `wrangler.jsonc` の `name`（現在は `gamelist-api`）で決まります。既に同名の Worker がある場合は、意図した対象か確認してからデプロイしてください。

## GitHub push で自動デプロイ

1. このディレクトリを含むコードを GitHub リポジトリへ push します。
2. Cloudflare Dashboard の **Workers & Pages** を開きます。
3. **Create application** → **Import a repository** を選び、GitHub リポジトリを接続します。
4. この API がリポジトリ直下でない場合、Root directory に `api` など、この `pyproject.toml` と `wrangler.jsonc` があるディレクトリを指定します。
5. Worker 名を `gamelist-api` に合わせ、保存してデプロイします。

以後、Cloudflare で選んだ本番ブランチ（通常は `main`）へ push すると自動でビルド・デプロイされます。

```powershell
git add .
git commit -m "Update API"
git push
```

Cloudflare 側の Deploy command は通常、既定の `npx wrangler deploy` のままで利用できます。Python Workers の依存関係は `pyproject.toml` から解決されます。

## ファイル構成

```text
api/
├─ src/
│  └─ main.py
├─ .gitignore
├─ pyproject.toml
├─ README.md
└─ wrangler.jsonc
```

## 参考

- [Cloudflare Workers: FastAPI](https://developers.cloudflare.com/workers/languages/python/packages/fastapi/)
- [Cloudflare Workers Builds: Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)
