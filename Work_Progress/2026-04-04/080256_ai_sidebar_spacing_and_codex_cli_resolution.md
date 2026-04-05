# 任务记录

## 任务名称
- 修复 AI 侧栏最窄宽度留白不一致，并让 `pnpm dev` 下内嵌 AI 稳定识别本机 Codex CLI

## 执行时间
- 开始时间：2026-04-04 08:02:56
- 结束时间：2026-04-04 08:13:52

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 统一 AI 侧栏头部区域在最窄宽度下的右侧留白。
- 修复 bridge 进程对本机 `codex` CLI 解析不稳定导致的 `cli_missing` 状态。

## 解决的问题
- 统一了 AI 侧栏头部区域在最窄宽度下的横向 inset，去掉了 `actionsRow` 额外的左右 padding，并让 `statusDetails` 与 `Context` 区域使用一致的外侧留白基准。
- 为 bridge 增加了 Windows 下的 `codex` CLI 回退解析链路，优先走 `PATH`，失败后再尝试 npm 全局安装路径和 VS Code 扩展内置 `codex.exe`。
- 调整了 AI 侧栏对 `cli_missing` 状态的文案与交互提示，使其区分“服务未连接”“CLI 未解析到”“需要重新验证”三类问题。
- 补充并通过了 `codex-runner` 与 `AiSidebar` 的针对性测试，构建也已通过。

## 问题原因
- AI 侧栏头部同一片区域混用了多套横向 padding 规则，最明显的是 `.header` 与 `.actionsRow` 同时控制左右内边距，导致最窄宽度时右侧视觉边界不一致。
- bridge 之前只依赖子进程环境中的 `PATH` 解析 `codex` 命令；当 `pnpm dev` 由 VS Code 或旧终端环境启动时，bridge 进程可能拿不到最新 PATH，进而误判为 `cli_missing`。

## 尝试的解决办法
1. 将 AI 侧栏头部抽成统一的横向 inset 模型，在 `.panel` 中定义 `--ai-sidebar-inline-padding`，让 `.header` 和 `.infoSection` 共用同一套左右留白。
2. 移除 `.actionsRow` 的额外左右 padding，仅保留顶部间距，并限制头部子块最小宽度，避免最窄宽度时内容把右边界挤满。
3. 重写 `server/codex-runner.ts` 的 `codex` CLI 解析逻辑，新增 `resolveCodexCommand` 与 Windows fallback 扫描。
4. 为 npm 全局路径、VS Code 扩展路径、CLI 缺失与流式执行命令路径补了 runner 测试。
5. 为 AI 侧栏补了 `cli_missing` 文案分支测试，并验证服务未连接、重新验证、执行失败三类已有分支未回退。
6. 运行 `pnpm test server/codex-runner.test.ts src/features/ai/components/AiSidebar.test.tsx`。
7. 运行 `pnpm build`。

## 是否成功解决
- 状态：成功
- 说明：实现和测试已完成，相关用例与构建均通过。右侧最窄宽度的视觉修复已落代码；内嵌 AI 的 CLI 解析问题已从 bridge 侧补上 PATH 之外的 Windows 回退能力。

## 相关文件
- `src/features/ai/components/AiSidebar.tsx`
- `src/features/ai/components/AiSidebar.module.css`
- `server/codex-runner.ts`
- `server/codex-runner.test.ts`
- `src/features/ai/components/AiSidebar.test.tsx`

## 遗留问题/下一步
- 如果需要进一步确认最窄宽度下的视觉细节，下一步可以在浏览器里手工拖拽侧栏复核一次。
- 当前工作区还存在这轮任务之外的未提交改动，后续提交时需要单独整理提交范围。
