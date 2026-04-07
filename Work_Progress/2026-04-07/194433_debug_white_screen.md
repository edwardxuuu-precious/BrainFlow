# 任务记录

## 任务名称
- 排查 BrainFlow 编辑页白屏问题

## 执行时间
- 开始时间：2026-04-07 19:45:30
- 结束时间：2026-04-07 20:07:54

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 找出 `127.0.0.1:4173/map/...` 白屏原因并修复。

## 解决的问题
- 修复编辑页打开脑图时出现的白屏问题。
- 修复 IndexedDB 中坏数据导致的树结构异常加载问题。
- 增加编辑页布局异常兜底，避免再次直接白屏。

## 问题原因
- `MapEditorPage` 中将 React Flow 的空选区同步放在 `onSelectionChange` 里，React Flow 内部同步过程中会反复抛出空选区事件，导致外部 Zustand 状态和内部 StoreUpdater 相互回写，最终触发 `Maximum update depth exceeded`。
- `document-service` 只修复了 `workspace`，没有修复 `topics` 树结构；当本地 IndexedDB 文档存在缺失子节点、孤儿节点或环引用时，布局计算存在崩溃风险。
- 页面在 dev 模式下即使前端可构建，仍可能因上述运行时循环直接白屏。

## 尝试的解决办法
1. 建立任务记录。
2. 检查页面控制台、网络请求、运行日志。
3. 用 Playwright 复现白屏，并确认浏览器控制台真实错误为 `Maximum update depth exceeded`，来源于 React Flow 的 `StoreUpdater`。
4. 在 `src/features/documents/document-service.ts` 中补充文档树修复逻辑，清理无效 `childIds`、断裂父子关系、孤儿节点和环引用。
5. 在 `src/pages/editor/MapEditorPage.tsx` 中增加布局异常兜底视图，并让布局缓存只依赖真正影响布局的内容字段。
6. 将空选区清空逻辑从 `onSelectionChange` 挪到 `onPaneClick`，避免 React Flow 内部同步事件触发外部状态抖动。
7. 移除编辑页对 React Flow `onNodesChange` 的不必要受控回灌，减少运行时循环风险。
8. 运行 `pnpm test -- --run src/pages/editor/MapEditorPage.test.tsx src/features/documents/document-service.test.ts`。
9. 运行 `pnpm build`。
10. 重新用 Playwright 注入损坏文档到 IndexedDB，并验证 `/map/doc_broken_preview` 可以正常渲染、不再白屏。

## 是否成功解决
- 状态：成功
- 说明：真实浏览器中已能打开损坏文档，白屏消失；当前仅剩 AI bridge 未启动时 `/api/codex/status` 与 `/api/codex/settings` 返回 `503`，但不影响脑图编辑页渲染。

## 相关文件
- src/features/documents/document-service.ts
- src/features/documents/document-service.test.ts
- src/pages/editor/MapEditorPage.tsx
- src/pages/editor/MapEditorPage.module.css
- src/pages/editor/MapEditorPage.test.tsx
- src/features/editor/components/HierarchySidebar.test.tsx

## 遗留问题/下一步
- 若要本地完整使用 AI 侧边栏，需要同时启动 bridge 服务，而不是只跑 `pnpm dev:web-only`。
- `MapEditorPage` 产物 chunk 仍超过 500 kB，后续可继续做拆包优化，但不影响当前白屏修复。
