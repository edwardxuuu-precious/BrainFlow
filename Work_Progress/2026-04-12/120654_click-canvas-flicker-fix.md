# 任务记录

## 任务名称
- 修复点击画布与新建节点编辑后的闪烁

## 执行时间
- 开始时间：2026-04-12 12:06:54
- 结束时间：2026-04-12 12:20:02

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 定位点击空白画布与新建节点编辑后出现闪烁的具体原因，并修复节点整批重建、纯工作区状态误触发保存与相关重渲染。

## 解决的问题
- 收窄了 `MapEditorPage` 中 React Flow 节点同步：点击空白画布清空选中时，仅替换实际选中状态变化的节点对象，不再整批重建所有节点。
- 将 `tree-operations.ts` 中 `updateViewport`、`updateWorkspaceSelection`、`updateWorkspaceChrome`、`updateWorkspaceHierarchyCollapsed` 改为轻量浅拷贝，保留 `topics/theme` 引用，避免纯 workspace 变化触发布局重算与大对象序列化。
- 将编辑器自动保存 effect 改为只响应 `isDirty` 的内容变更，不再因为 `clearSelection`、侧栏开关、viewport 变化触发保存。
- 调整 `editor-store.ts` 的 workspace-only 提交流程，不再把选择态/侧栏/viewport 变化标记为 `hasPendingWorkspaceSave`。
- 在 `cloud-sync-orchestrator.ts` 的 `saveDocument()` 中新增内容未变化短路：仅更新设备态缓存，不刷新 `localSavedAt`、不广播伪保存状态。
- 为右侧栏模式加入本地记忆，默认读取并回写 `brainflow-editor-right-panel-mode`，只在用户手动切换时改变；点击画布不会把右侧栏带回“节点”。
- 修正 `handleCanvasNodeDrag` 的依赖，避免拖拽结构预览使用过期的 `document/layout` 上下文。

## 问题原因
- 点击空白画布会触发 `clearSelection()`，原实现会先把 workspace 选择态写回文档，再在 `MapEditorPage` 中重建整批 `layout.renderNodes` 并整体替换给 React Flow，导致整个画布出现一次明显重绘。
- 纯 workspace 状态变化原本也会进入自动保存链；即使 `toDocumentContent()` 过滤掉 viewport/workspace，这条链仍会刷新本地保存时间与存储订阅，造成额外一次无意义重渲染。
- `buildLayoutCacheKey()` 依赖对 `topics/theme` 的整量 `JSON.stringify()`；而 workspace-only 更新以前使用 `structuredClone()` 复制整份文档，使得点画布这种无内容变化操作也要重新走布局缓存判断。
- 右侧栏模式只存在于组件本地状态，一旦页面发生异常重挂载或刷新回到默认态，就会回到“节点”页签，和用户预期不符。

## 尝试的解决办法
1. 梳理 `MapEditorPage`、`editor-store`、`tree-operations`、`cloud-sync-orchestrator` 的选择、布局和保存链路。
2. 将 workspace-only 更新改为浅拷贝，保留内容层引用，让布局只在内容真正变化时重算。
3. 重写画布节点同步逻辑，按节点粒度复用旧对象，仅替换真正变化的节点。
4. 把自动保存条件收窄到 `isDirty`，并让 `commitWorkspaceDocument` 不再为选择态变化排入保存。
5. 在同步层 `saveDocument()` 加入内容 hash 未变化短路，避免伪保存刷新。
6. 为右侧栏模式增加本地记忆，并补充“点击空白画布不切换面板”的回归测试。
7. 修复拖拽结构预览测试暴露出的 `handleCanvasNodeDrag` 依赖不完整问题。
8. 运行 `npx vitest run src/features/editor/editor-store.test.ts src/pages/editor/MapEditorPage.test.tsx src/features/storage/sync/cloud-sync-orchestrator.test.ts`，44 个测试全部通过。
9. 运行 `npm run build:web`；本次改动未新增新的编译报错，但构建仍被仓库内既有 TypeScript 问题阻塞。

## 是否成功解决
- 状态：部分成功
- 说明：点击画布闪烁、纯选择态触发保存、右侧栏模式回跳这三条目标链路已完成修复并通过定向测试；整仓 `build:web` 仍被历史遗留 TypeScript 报错阻塞，未在本轮一并处理。

## 相关文件
- `Work_Progress/2026-04-12/120654_click-canvas-flicker-fix.md`
- `src/features/editor/tree-operations.ts`
- `src/features/editor/editor-store.ts`
- `src/pages/editor/MapEditorPage.tsx`
- `src/features/storage/sync/cloud-sync-orchestrator.ts`
- `src/features/editor/editor-store.test.ts`
- `src/pages/editor/MapEditorPage.test.tsx`
- `src/features/storage/sync/cloud-sync-orchestrator.test.ts`

## 遗留问题/下一步
- 如需整仓构建通过，后续需单独处理现存报错：
- `src/features/documents/document-service.test.ts` 未使用变量
- `src/features/import/text-import-batch-compose.ts` 未使用变量
- `src/features/storage/adapters/indexeddb/legacy-document-local-service.ts` 重复属性
- `src/features/storage/services/document-repository.ts` 未使用变量
- `server/app.ts` 的 `string | null` 类型问题
- `server/codex-bridge.test.ts` 的可选值判空问题
- `server/postgres-backup.test.ts` 的类型断言问题
