# 任务记录

## 任务名称
- 修复 Codex 不可用提示与状态检查交互

## 执行时间
- 开始时间：2026-04-03 10:48:27
- 结束时间：2026-04-03 11:29:05

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 修复 AI 侧栏把“服务未连接”和“需要验证”混淆的问题。
- 调整状态按钮与状态详情展开逻辑，避免“检查中”时无法查看细节。
- 恢复本地开发模式与构建模式下的 Codex bridge 可用性，确认 `4173` 和 `8787` 可访问。

## 解决的问题
- 输入区禁用文案改为根据状态动态显示，区分“未连接本机 Codex 服务”“需要验证”“最近一次执行失败”。
- 状态按钮不再因“检查中”而整体禁用，检查进行中仍可展开或收起详情。
- 状态详情增加了本地服务未连接、重新验证、最近一次执行失败三类排障说明，并保留日志查看指引。
- 修复了构建版服务端读取 `server/prompts/brainflow-system.md` 时的路径错误，`/api/codex/status` 不再因 `ENOENT` 返回 500。
- 修复了 `start:server` 指向错误入口的问题，构建后可直接启动 `server/dist/server/index.js`。

## 问题原因
- 前端把 `status === null`、`status.ready === false`、`lastExecutionError` 三种状态混在同一套“验证失败”文案里，导致 UI 含义错误。
- 状态按钮在 `isCheckingStatus` 时被禁用，用户无法查看当前检查细节与错误摘要。
- 构建产物中的 `server/system-prompt.ts` 默认只按模块相对路径查找 `prompts/brainflow-system.md`，构建后路径落到 `server/dist/server/prompts`，而真实文件在 `server/prompts`。
- `package.json` 的 `start:server` 仍指向旧的 `server/dist/index.js`，与实际构建输出不一致。

## 尝试的解决办法
1. 更新 `AiSidebar` 和 `AiComposer` 的派生状态与文案映射，分别处理服务未连接、需要验证和最近一次执行失败。
2. 调整状态按钮交互：检查中仅切换详情，不重复发起 revalidate；出现状态错误时自动展开详情。
3. 补充前端单测与 E2E 用例，覆盖服务未连接、需要验证、执行失败三条路径。
4. 修复 `server/system-prompt.ts` 的默认提示词路径解析逻辑，增加源码目录、构建目录与仓库目录的多级回退。
5. 修复 `system-prompt` 摘要截断中的异常字符，统一改为 ASCII `...`。
6. 新增 `server/system-prompt.test.ts`，验证构建产物路径下仍能读取仓库内提示词文件。
7. 修正 `package.json` 中的 `start:server` 启动入口，并重新执行构建与运行验证。
8. 通过本机实际请求验证 `http://127.0.0.1:8787/api/codex/status` 和 `http://127.0.0.1:4173/api/codex/status` 均返回可用状态。

## 是否成功解决
- 状态：成功
- 说明：前端状态提示、状态详情交互、构建版服务启动链路和本地代理访问均已修复并完成测试验证。

## 相关文件
- `package.json`
- `server/system-prompt.ts`
- `server/system-prompt.test.ts`
- `src/features/ai/components/AiComposer.tsx`
- `src/features/ai/components/AiSidebar.tsx`
- `src/features/ai/components/AiSidebar.module.css`
- `src/features/ai/components/AiSidebar.test.tsx`
- `src/test/e2e/brainflow.spec.ts`
- `src/components/ui/icons.tsx`
- `src/features/ai/components/AiContextTray.tsx`
- `Work_Progress/2026-04-03/104827_server_stderr.log`
- `Work_Progress/2026-04-03/112500_server_stdout.log`
- `Work_Progress/2026-04-03/112500_dev_stdout.log`

## 遗留问题/下一步
- PowerShell 中直接打印 `/api/codex/status` 返回的 `systemPrompt` 时，中文业务提示词仍表现为乱码，需要后续单独确认终端编码或提示词文件编码；这不影响本次状态链路修复与接口可用性验证。
