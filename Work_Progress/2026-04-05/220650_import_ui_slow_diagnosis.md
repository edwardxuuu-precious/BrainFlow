# 任务记录

## 任务名称
- 排查“Markdown 导入 UI 很慢但 benchmark 很快”的原因

## 执行时间
- 开始时间：2026-04-05 22:00:00
- 结束时间：2026-04-05 22:06:50

## 仓库根目录
- `C:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 解释为什么 benchmark 显示本地 Markdown 导入很快，但实际界面导入长时间停留在初始化状态。
- 修复明显的 Worker 环境兼容性问题，验证前端构建和相关测试仍然通过。

## 解决的问题
- 定位到导入弹窗卡在 `Preparing the local Markdown import pipeline...`、`4%`、`Semantic stage: Not started` 时，并不代表 Markdown 解析慢，而是说明导入 Worker 很可能没有发送第一条进度消息。
- 识别出 `src/features/ai/ai-client.ts` 里仍使用 `window.setTimeout/window.clearTimeout`，而该模块会被导入 Worker 间接依赖，Worker 环境没有 `window`，可能导致启动阶段直接失败。
- 已将该模块中的定时器调用改为 `globalThis.setTimeout/globalThis.clearTimeout`，消除这条明显的 Worker 启动风险。
- 额外给 `src/features/import/text-import-job.ts` 补了 Worker `error/messageerror` 监听，即使 Worker 以后再次启动失败，界面也会直接报真实错误，而不是长期停留在 4% 像“很慢”。

## 问题原因
- 之前的 benchmark 主要测的是“本地结构导入算法本身”的速度，直接调用本地解析逻辑，因此很快。
- 实际 UI 导入路径还依赖浏览器 Worker 启动、依赖图加载和前端消息传递；一旦 Worker 在启动阶段因浏览器环境不兼容而失败，界面就会一直停在最初的 4% 初始化状态，看起来像“很慢”，实际上是“根本没开始跑”。

## 尝试的解决办法
1. 检查导入 UI 的状态文本和进度起点，确认截图卡住的位置属于“Worker 尚未回传第一条状态”阶段。
2. 阅读 `src/features/import/text-import.worker.ts`、`src/features/import/text-import-client.ts`、`src/features/ai/ai-client.ts`，定位 Worker 依赖链。
3. 搜索前端代码中的 `window.setTimeout/window.clearTimeout`，确认 `src/features/ai/ai-client.ts` 存在 Worker 不兼容写法。
4. 将 `src/features/ai/ai-client.ts` 改为 `globalThis.setTimeout/globalThis.clearTimeout`。
5. 在 `src/features/import/text-import-job.ts` 增加 Worker 启动失败和消息反序列化失败的错误透传。
6. 重新运行：
   - `pnpm vitest run src/features/import/text-import-store.test.ts src/features/import/components/TextImportDialog.test.tsx server/app.test.ts server/codex-bridge.test.ts`
   - `pnpm build:web`
   - `pnpm vitest run src/features/import/text-import-store.test.ts src/features/import/components/TextImportDialog.test.tsx`
   - `pnpm build:web`

## 是否成功解决
- 状态：部分成功
- 说明：已经修复一条高度可疑的 Worker 兼容性问题，并确认相关测试和前端构建通过。是否完全解决你当前页面上的卡顿，还需要你重启当前前端开发进程后再次实测确认；因为旧的 dev 进程和浏览器缓存可能仍在运行旧 bundle。

## 相关文件
- `src/features/ai/ai-client.ts`
- `src/features/import/text-import-client.ts`
- `src/features/import/text-import-job.ts`
- `src/features/import/text-import.worker.ts`
- `Work_Progress/2026-04-05/220650_import_ui_slow_diagnosis.md`

## 遗留问题/下一步
- 需要在浏览器中重新触发一次导入，确认界面不再停在固定 4%。
- 如果仍然卡住，下一步要直接抓浏览器控制台与 Worker 错误事件，继续排查 Worker 启动链路。
- 已经增加了 `error/messageerror` 透传；如果仍有问题，下一步要补具体的浏览器控制台堆栈和 `jobId` 关联日志。
