# 任务记录

## 任务名称
- 修复 Windows 下 dev supervisor 启动失败导致 127.0.0.1 refused

## 执行时间
- 开始时间：2026-04-03 18:50:19
- 结束时间：2026-04-03 18:53:03

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 修复 `pnpm dev` 在 Windows + Node 24 下启动即退出的问题，恢复 4173 前端可访问，并保留已做的 bridge 自动重启与 AI 降级逻辑。

## 解决的问题
- 修复了 `pnpm dev` 在 Windows + Node 24 下启动即退出的问题，恢复前端 4173 端口可访问。
- 将 dev supervisor 的 Windows 子进程启动方式从直接 `spawn('pnpm.cmd', ...)` 改为 `cmd.exe /d /s /c "pnpm <script>"`。
- 为 supervisor 补齐同步 `spawn` 失败的处理：`web` 启动失败会清晰退出，`api` 启动失败会进入退避重试而不是直接打死整套 dev。
- 新增平台命令构造与同步失败路径测试，防止同类 Windows 回归再次漏掉。
- 实际验证 `pnpm dev` 已能拉起 `http://127.0.0.1:4173/` 和 `http://127.0.0.1:8787/api/codex/status`，两者均返回 200。

## 问题原因
- 根因不是页面运行时错误，而是 `pnpm dev` 根本没有成功启动 `web`。
- 当前 Windows 环境下，Node 24 直接 `spawn('pnpm.cmd', ...)` 会同步抛出 `EINVAL`，导致 dev supervisor 在创建第一个子进程时就退出。
- 之前的 supervisor 单测完全 mock 掉了 `spawn`，覆盖了重启流程，但没有覆盖 Windows 真实命令构造，因此这个平台级故障没有被测出来。

## 尝试的解决办法
1. 复现 `pnpm dev` 的真实退出堆栈，确认是否为 supervisor 启动命令选择问题。
2. 改造 Windows 子进程启动策略与同步 `spawn` 失败处理。
3. 补齐命令构造和失败路径测试。
4. 执行 `pnpm exec vitest run server/dev-supervisor.test.ts`、`pnpm exec tsc -b --pretty false`、`pnpm test`。
5. 后台启动一套 `pnpm dev`，实测验证 4173 与 8787 都返回 200，然后清理进程树。

## 是否成功解决
- 状态：成功
- 说明：`pnpm dev` 已不再因 `spawn EINVAL` 立即退出；编译、单测与真实启动验证全部通过。

## 相关文件
- package.json
- server/dev-supervisor.ts
- server/dev-supervisor.test.ts
- vite.config.ts
- src/features/ai/ai-store.ts
- src/pages/editor/MapEditorPage.tsx
- Work_Progress/2026-04-03/185019_dev_stdout.log
- Work_Progress/2026-04-03/185019_dev_stderr.log
- Work_Progress/2026-04-03/185019_fix_windows_dev_supervisor_spawn.md

## 遗留问题/下一步
- 当前仍保留之前已做的 AI 状态防风暴与 Vite 代理降级逻辑，本轮没有回滚它们。
- Vitest 仍会打印 `HTMLCanvasElement.getContext()` 的 jsdom 提示，但不影响本次修复结果；如需清理可后续统一补 canvas mock。
