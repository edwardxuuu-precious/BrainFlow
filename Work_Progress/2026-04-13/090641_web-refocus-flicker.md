任务名称：修复切回 Web 端时页面闪烁问题
执行时间：2026-04-13 09:06:41
仓库根目录：C:\Users\edwar\Desktop\BrainFlow
任务背景：用户反馈从其他软件切回系统 Web 端时，页面会闪烁一下，影响使用体验。
任务目标：定位切回焦点时的闪烁原因，并完成代码修复与验证。
已执行动作：
- 检查仓库结构、任务记录要求与前端相关代码，确认闪烁与切回前台后的同步状态更新有关。
- 排查 `focus`、`visibilitychange`、首页列表刷新、编辑页保存状态与冲突弹窗订阅链路。
- 新增冲突弹窗宿主组件与保存状态组件，下沉订阅；优化首页仅在文档列表相关状态变化时做后台刷新。
- 补充首页测试，调整编辑页 AI 客户端测试 mock，并执行针对性验证。
结果：切回前台时不再因为同步心跳触发首页 loading 闪屏，也不会让 App/编辑页因同步状态变化整页重渲。
状态：成功
相关文件：
- src/App.tsx
- src/components/StorageSaveIndicator.tsx
- src/features/storage/ui/StorageConflictDialogHost.tsx
- src/pages/editor/MapEditorPage.tsx
- src/pages/home/HomePage.tsx
- src/pages/home/HomePage.test.tsx
- src/pages/editor/MapEditorPage.test.tsx
- Work_Progress/2026-04-13/090641_web-refocus-flicker.md
验证：
- `npx vitest run src/pages/home/HomePage.test.tsx src/features/storage/ui/StorageConflictExperience.test.tsx` 通过。
- `npx tsc -p tsconfig.app.json --noEmit` 仍有仓库内既有错误，集中在 `TopicNode.tsx`、`ai-store.ts`、`legacy-document-local-service.ts` 等文件，与本次修复无直接关系。
- 单独运行 `src/pages/editor/MapEditorPage.test.tsx` 时发现仓库当前缺少 `src/features/ai/components/AiMessageList.tsx`，属于现有测试环境问题。
遗留问题/下一步：如需继续做全量前端编译或编辑页测试收口，需要先补齐 AI 组件文件并清理现有 TypeScript 旧错误。
