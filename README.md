# BrainFlow

BrainFlow 是一个本地优先的 Web 脑图工具，融合经典脑图编辑体验与 AI 协作能力，采用简洁现代的界面设计。

## 核心特性

### 🧠 脑图编辑
- **经典布局**：根节点居中，一级分支左右展开，自动布局算法
- **手工微调**：支持在自动布局基础上拖拽微调节点位置
- **主题类型**：普通主题、里程碑（⭐）、任务（✅）三种类型，不同视觉标识
- **节点样式**：支持自定义背景色、文字色、分支色，多种预设风格
- **层级导航**：左侧目录面板快速浏览和定位节点

### 🤖 AI 协作
- **智能对话**：基于当前脑图上下文与 AI 进行对话
- **会话管理**：支持多会话切换、重命名、归档
- **AI 锁定**：锁定节点防止 AI 修改，保护关键内容
- **上下文感知**：AI 可读取整个脑图结构进行智能建议

### 📝 节点详情
- **富文本备注**：支持详细内容编辑
- **标签系统**：为主题添加标签分类
- **任务管理**：设置任务状态（待办/进行中/已完成）和优先级
- **链接引用**：支持网页链接、主题链接、本地资源链接
- **附件引用**：关联外部资源

### 🎨 标记与格式
- **标记**：重点、问题、灵感、风险、决策、阻塞等状态标记
- **贴纸**：多种 Emoji 贴纸装饰节点
- **主题预设**：一键切换整体配色方案
- **画布样式**：自定义背景色、强调色、分支色板

### 💾 数据管理
- **本地优先**：数据存储在浏览器 IndexedDB，无需注册账号
- **自动保存**：实时自动保存编辑内容
- **导入导出**：支持 JSON、PNG 导出，Markdown 导入
- **撤销重做**：完整的历史记录管理

## 截图

| 文档工作台 | 脑图编辑器 |
| --- | --- |
| ![BrainFlow home workspace](docs/screenshots/home.png) | ![BrainFlow editor](docs/screenshots/editor.png) |

## 快速开始

### 环境要求

- Node.js 20+
- pnpm 9+

### 本地开发

```bash
pnpm install
pnpm dev
```

默认访问地址：`http://localhost:5173/`

AI 功能需要本地运行 Codex CLI（端口 8787），如不需要 AI 功能可使用：

```bash
pnpm dev:web-only
```

### 常用命令

```bash
pnpm dev              # 启动前端 + AI 服务
pnpm dev:web-only     # 仅启动前端
pnpm dev:server       # 仅启动 AI 服务
pnpm build            # 构建生产版本
pnpm preview          # 预览构建产物
pnpm lint             # 代码检查
pnpm test             # 单元测试
pnpm test:e2e         # E2E 测试
```

## 部署

BrainFlow 是纯前端 Vite 应用，部署产物为 `dist/`。

### Vercel

已提供 [vercel.json](vercel.json) 配置。

- Framework Preset: `Vite`
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm build`
- Output Directory: `dist`

### 其他静态托管

1. 执行 `pnpm build`
2. 部署 `dist/` 目录
3. 配置 SPA 回退到 `/index.html`

**注意**：数据保存在浏览器本地，不同域名/浏览器/设备之间数据不互通。

## 技术栈

- **前端**：React 19 + TypeScript + Vite
- **状态管理**：Zustand
- **脑图引擎**：@xyflow/react
- **AI 服务**：Hono + OpenAI
- **存储**：IndexedDB + localStorage
- **测试**：Vitest + Playwright

## 项目结构

```text
src/
  components/          # 通用组件（节点、图标、UI 控件）
  features/
    documents/         # 文档模型、主题类型、存储服务
    editor/            # 编辑器状态、布局引擎、导出逻辑
    ai/                # AI 会话、Codex 集成
  pages/
    home/              # 文档工作台首页
    editor/            # 脑图编辑器页面
server/                # AI 服务后端（Hono）
```

## 当前边界

- 无账号体系和云同步，数据仅保存在本地浏览器
- 不兼容 XMind 等第三方格式
- 拖拽仅支持位置偏移，暂不支持修改父子结构
- 移动端适配以查看为主，完整编辑建议桌面端使用

## 验证

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
```

## License

MIT
