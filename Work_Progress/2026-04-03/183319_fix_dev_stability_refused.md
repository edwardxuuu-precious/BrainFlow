# 任务记录

## 任务名称
- 修复本地开发环境频繁整站掉线与 127.0.0.1 refused

## 执行时间
- 开始时间：2026-04-03 18:33:19
- 结束时间：2026-04-03 18:45:02

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 修复 `pnpm dev` 下前端与本地 bridge 互相连坐导致的整站掉线，并消除 AI 面板在 bridge 不可达时的状态请求风暴。

## 解决的问题
- 将 `pnpm dev` 从 `concurrently -k` 改为本地 supervisor 启动，避免 `api` 退出时把 `web` 一并带死。
- 新增 bridge 子进程自动拉起与退避重启逻辑，并补了 Windows 下的进程树清理。
- 为 Vite `/api` 代理补齐 bridge 掉线时的 503 JSON 降级响应，前端不再吃裸 `ECONNREFUSED`。
- 收敛 AI 状态初始化逻辑，去掉页面层自动状态重试风暴，保留首次初始化和手动重试。
- 修复同一文档重复 `hydrate` 时再次拉取 Codex 状态/设置的问题。
- 新增 supervisor、代理降级、AI 状态防风暴相关测试，并恢复全量测试通过。

## 问题原因
- `pnpm dev` 原先依赖 `concurrently -k`，任何一个子进程退出都会把另一侧也一起杀掉，所以 bridge 崩掉时很容易演变成整站 `127.0.0.1 refused`。
- Vite 代理在 bridge 不可达时只会向终端打印 `ECONNREFUSED`，没有向前端返回稳定可消费的 JSON 错误。
- 编辑器页在 AI 状态未就绪时存在自动检查竞态与重复初始化路径，bridge 断开后会把失败请求放大成持续重试。

## 尝试的解决办法
1. 梳理现有 `pnpm dev` 启动链路、Vite 代理配置和 AI 状态自动检测逻辑。
2. 用本地 supervisor 替换 `concurrently -k`，保证前端保活且 bridge 可自动拉起。
3. 改造 AI 状态初始化逻辑，避免 bridge 断开时无限自动重试。
4. 为 Vite 代理补齐 bridge 掉线时的结构化降级响应，并补测试验证。
5. 执行 `pnpm exec tsc -b --pretty false` 与 `pnpm test` 验证改动。

## 是否成功解决
- 状态：成功
- 说明：本次修复已完成，TypeScript 构建与全量 Vitest 测试均通过。

## 相关文件
- package.json
- vite.config.ts
- server/dev-proxy.ts
- server/dev-proxy.test.ts
- server/dev-supervisor.ts
- server/dev-supervisor.test.ts
- src/features/ai/ai-store.ts
- src/features/ai/ai-store.test.ts
- src/features/ai/ai-client.test.ts
- src/pages/editor/MapEditorPage.tsx
- src/pages/editor/MapEditorPage.test.tsx

## 遗留问题/下一步
- Vitest 运行仍会打印 `HTMLCanvasElement.getContext()` 的 jsdom 提示，但不影响本次修复结果；后续如需清理，可统一补 canvas mock。
- 这次主要通过类型和测试验证，未再做一次长时间人工挂起运行；如果需要，我可以继续补一轮实际 `pnpm dev` 的长时 smoke check。
