# BrainFlow 部署说明

BrainFlow 是一个纯前端单页应用，构建产物位于 `dist/`。项目使用 `react-router-dom` 的 `BrowserRouter`，因此在线上环境必须配置 SPA 路由回退。

## 构建

```bash
pnpm install
pnpm build
```

构建完成后，部署目录是 `dist/`。

## Vercel

仓库根目录已提供 [vercel.json](../vercel.json)：

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

推荐配置：

- Framework Preset: `Vite`
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm build`
- Output Directory: `dist`

## Netlify

仓库已提供 [public/_redirects](../public/_redirects)：

```text
/* /index.html 200
```

推荐配置：

- Build command: `pnpm build`
- Publish directory: `dist`

## 其他静态托管平台

如果你使用 Cloudflare Pages、Nginx、Caddy、S3 + CDN 或其他静态托管方案，需要满足两个条件：

1. 能直接托管 `dist/` 目录
2. 能将前端路由回退到 `/index.html`

如果没有回退规则，刷新 `/map/:id` 这样的地址时会得到 404。

## 数据存储说明

BrainFlow 当前是本地优先应用：

- 文档正文保存在 `IndexedDB`
- 文档索引、最近打开和部分偏好保存在 `localStorage`

这意味着：

- 同一个部署地址下，不同浏览器的数据互相隔离
- 更换域名后，会看到新的空工作区
- 当前版本不提供跨设备同步

## 上线前检查

建议在部署前执行：

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
```
