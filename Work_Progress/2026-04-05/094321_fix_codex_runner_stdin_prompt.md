# 任务记录

## 任务名称
- 修复 Windows 下 Codex 执行链路 `spawn ENAMETOOLONG`

## 执行时间
- 开始时间：2026-04-05 09:43:21
- 结束时间：2026-04-05 09:45:44

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 将 Codex CLI 的 prompt 传递方式从命令行参数改为 stdin，修复 Windows 下文本导入与其他长 prompt 场景触发的 `spawn ENAMETOOLONG`。

## 解决的问题
- 将 Codex CLI prompt 传递方式从命令行参数改为 stdin，避免 Windows 下长文本导入与大上下文对话触发 `spawn ENAMETOOLONG`。
- 保持 `server/codex-bridge.ts` 与 `server/app.ts` 的协议不变，只调整 `server/codex-runner.ts` 的底层执行实现。
- 补充并更新 `server/codex-runner.test.ts`，验证 `execute` 与 `executeMessage` 都通过 `codex exec -` 加 stdin 传 prompt，而不是把 prompt 放进 args。
- 已通过运行器、bridge、app、文本导入 store 相关测试，以及服务端和前端构建验证。

## 问题原因
- 当前实现会把完整 prompt 追加到 `codex exec [PROMPT]` 的命令行参数中。
- 文本导入场景会把系统 prompt、整张脑图上下文、原始文件全文和预处理线索一起拼成超长 prompt。
- 在 Windows 上，这类超长命令参数会让 Node `spawn` 直接抛出 `ENAMETOOLONG`，因此报错发生在执行层，而不是 markdown 解析层。

## 尝试的解决办法
1. 检查 `codex exec --help`，确认 Codex CLI 官方支持使用 `-` 从 stdin 读取 prompt。
2. 在 `server/codex-runner.ts` 中把 `runStreamingCommand` 改为 `stdio: ['pipe', 'pipe', 'pipe']`，并支持 `inputText` 写入 stdin 后主动结束输入。
3. 将 `execute` 与 `executeMessage` 的 `codex exec` 调用统一改成末尾传 `-`，同时通过 `inputText` 传入完整 prompt。
4. 更新 `server/codex-runner.test.ts`，校验 args 末尾是 `-`、options 中包含 `inputText`，且原始 prompt 不再出现在 args。
5. 运行 `pnpm vitest run server/codex-runner.test.ts`。
6. 运行 `pnpm vitest run server/app.test.ts server/codex-bridge.test.ts src/features/import/text-import-store.test.ts`。
7. 运行 `pnpm build:server` 与 `pnpm build:web` 做构建验证。

## 是否成功解决
- 状态：成功
- 说明：Codex 执行链路已经改为通过 stdin 传 prompt，相关测试与构建均通过。本次未处理截图中已有的中文乱码文案，因为那是独立编码问题。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\server\codex-runner.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-runner.test.ts
- C:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-05\094321_fix_codex_runner_stdin_prompt.md

## 遗留问题/下一步
- 建议手工再导入一个 3KB 以上 `.md` 文件，确认界面上不再出现 `spawn ENAMETOOLONG`。
- 工作区仍有与本任务无关的已有改动：`src/pages/home/HomePage.module.css`。
