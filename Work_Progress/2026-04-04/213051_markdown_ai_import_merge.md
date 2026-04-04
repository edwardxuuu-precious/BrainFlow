# 任务记录

## 任务名称
- Markdown 智能导入与 AI 脑图合并实现

## 执行时间
- 开始时间：2026-04-04 21:30:51
- 结束时间：2026-04-04 22:01:30

## 仓库根目录
- `C:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 为 BrainFlow 增加 `.md` 文件导入能力。
- 在导入前完成 Markdown 结构化预处理，并把结果发送给系统内部 AI 做语义合并、冲突识别和预览生成。
- 在编辑器内提供“预览后应用”的导入流程，并在应用后直接更新脑图、重算布局与聚焦结果分支。

## 解决的问题
- 新增 Markdown 预处理链路，支持标题、段落、列表、任务列表、引用、代码块、表格的结构化提取与原文保留。
- 扩展共享 AI 合同，补充 Markdown 导入请求/响应、风险分级、冲突项、预览树与导入阶段事件。
- 扩展本地 Codex bridge 与服务端接口，新增 `/api/codex/import/preview` 流式预览接口。
- 新增前端导入状态 store、预览应用逻辑、导入弹窗和工具栏入口，支持选择 `.md` 文件、查看预览、勾选高风险冲突、确认应用。
- 导入结果复用现有 `applyAiProposal` / history / undo-redo / autosave 链路，不改文档持久化根结构。
- 顺手修复了右侧栏折叠控制、图标与锁定标识相关的回归，恢复测试与构建稳定性。

## 问题原因
- 原有系统只有通用 AI 对话改图流程，没有独立的 Markdown 解析、预处理、冲突审阅与导入闭环。
- 编辑器右侧栏组件之前存在未完成的折叠接口接线，导致本次集成后更容易暴露构建与测试问题。

## 尝试的解决办法
1. 在 `shared/ai-contract.ts` 中补齐 Markdown 导入协议、风险字段、冲突与流式阶段定义。
2. 在 `server/codex-bridge.ts` 中新增导入专用 schema、prompt 组装、响应归一化和 `previewMarkdownImport` 能力。
3. 在 `server/app.ts` 中新增 `/api/codex/import/preview` 路由，并按阶段输出流式状态事件。
4. 在 `src/features/import/` 下新增 Markdown 预处理、客户端流式请求、预览转 proposal、导入状态 store、导入弹窗与对应测试。
5. 在 `src/pages/editor/MapEditorPage.tsx` 中接入按钮、文件选择、导入弹窗、应用后布局聚焦。
6. 修复侧栏折叠按钮、图标实现和锁定状态展示，确保 `pnpm build:web` 与 `pnpm test` 全通过。

## 是否成功解决
- 状态：成功
- 说明：功能实现完成，前后端链路已接通，构建通过，测试通过。

## 相关文件
- `shared/ai-contract.ts`
- `server/codex-bridge.ts`
- `server/app.ts`
- `server/codex-bridge.test.ts`
- `server/app.test.ts`
- `src/features/import/markdown-preprocess.ts`
- `src/features/import/markdown-import-client.ts`
- `src/features/import/markdown-import-apply.ts`
- `src/features/import/markdown-import-store.ts`
- `src/features/import/components/MarkdownImportDialog.tsx`
- `src/features/import/components/MarkdownImportDialog.module.css`
- `src/features/import/markdown-preprocess.test.ts`
- `src/features/import/markdown-import-store.test.ts`
- `src/pages/editor/MapEditorPage.tsx`
- `src/components/topic-node/TopicNode.tsx`
- `src/components/ui/icons.tsx`

## 遗留问题/下一步
- 当前测试环境仍会打印 `HTMLCanvasElement.getContext()` 的 jsdom 提示，但不影响测试结果。
- 导入文案中仍有部分历史文件遗留的编码噪音，后续可以单独做一轮全仓文本清理。
- 首版仅支持文件导入，不支持直接粘贴 Markdown 文本，可在后续迭代补充。
