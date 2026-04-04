# BrainFlow

BrainFlow 是一个本地优先的 Web 脑图工具，产品方向参考 XMind 的脑图编辑体验，同时吸收了 Notion 式的简洁工作台和干净界面风格。

这个项目当前聚焦于一个可用的 MVP：

- 本地文档工作台
- 经典脑图布局编辑器
- 自动布局基础上的手工拖拽微调
- 本地自动保存、撤销重做、JSON / PNG 导出

项目不依赖后端服务。数据默认保存在当前浏览器的 `IndexedDB` 与 `localStorage` 中。

## 截图

| 文档工作台 | 编辑器 |
| --- | --- |
| ![BrainFlow home workspace](docs/screenshots/home.png) | ![BrainFlow editor](docs/screenshots/editor.png) |

## 当前能力

- 本地优先
  文档列表、最近打开、自动保存都基于浏览器本地存储实现。
- 经典脑图布局
  根节点居中，一级分支左右展开，后续层级继承方向。
- 手工拖拽偏移
  节点支持在自动布局基础上手工拖拽微调，刷新后位置仍会保留。
- 轻量编辑器
  支持新增子主题、同级主题、重命名、备注、折叠、一级分支方向切换。
- 导出能力
  支持导出内部 JSON 结构和 PNG 画布截图。
- 基础测试覆盖
  包含树操作、布局、组件交互，以及浏览器级 E2E 测试。

## 快速开始

### 运行环境

- Node.js 20+
- pnpm 9+

### 本地开发

```bash
pnpm install
pnpm dev
```

默认访问地址通常是 `http://localhost:5173/`。

### 常用命令

```bash
pnpm dev
pnpm dev:web
pnpm dev:web-only
pnpm dev:server
pnpm build
pnpm preview
pnpm lint
pnpm test
pnpm test:e2e
```

- `pnpm dev` / `pnpm dev:web`：默认开发入口，都会同时启动前端和本机 Codex bridge。
- `pnpm dev:web-only`：仅启动前端，仅用于排查纯 UI 问题，不适合作为日常开发入口。
- `pnpm dev:server`：仅启动本机 bridge，用于前端已在运行时单独恢复 `8787` 服务。

## 部署

BrainFlow 是一个纯前端 Vite 应用，部署产物为 `dist/`。因为项目使用 `BrowserRouter`，静态托管时需要把所有路由回退到 `index.html`。

### Vercel

仓库中已提供 [vercel.json](vercel.json) 用于 SPA 重写。

- Framework Preset: `Vite`
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm build`
- Output Directory: `dist`

### Netlify

仓库中已提供 [public/_redirects](public/_redirects)，构建后会复制到产物目录。

- Build command: `pnpm build`
- Publish directory: `dist`

### 其他静态托管

只要支持单页应用回退即可：

1. 执行 `pnpm build`
2. 部署 `dist/`
3. 将所有非静态资源请求回退到 `/index.html`

### 部署注意事项

- 当前项目没有环境变量依赖。
- 文档数据保存在浏览器本地，所以不同域名、不同浏览器、不同设备之间不会自动同步。
- 如果你在新的线上域名访问，看到的是一个新的空工作区，这是符合当前本地优先设计的。

更详细的部署说明见 [docs/deployment.md](docs/deployment.md)。

## 技术栈

- React 19
- TypeScript
- Vite
- `@xyflow/react`
- Zustand
- IndexedDB + localStorage
- Vitest
- Playwright

## 项目结构

```text
src/
  components/          通用节点组件
  features/
    documents/         文档模型、主题、存储服务
    editor/            布局、树操作、编辑器状态、导出逻辑
  pages/
    home/              文档工作台
    editor/            脑图编辑器页面
```

## 当前边界

- 不包含账号体系、云同步和多人协作
- 不兼容 XMind 源文件格式
- 目前拖拽解决的是手工位置偏移，不负责改父子结构
- 移动端以查看和基础浏览为主，不提供完整编辑体验

## 验证

当前版本通过以下检查：

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
```
