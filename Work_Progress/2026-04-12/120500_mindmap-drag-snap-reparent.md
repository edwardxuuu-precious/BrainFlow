# 任务记录

## 任务名称
- 脑图节点跨分支拖拽吸附与松手重挂

## 执行时间
- 开始时间：2026-04-12 12:05:00
- 结束时间：2026-04-12 12:21:03

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 实现脑图节点拖拽到其他分支后的自动吸附预览，并且只在用户松开左键后真实提交父子关系变更。

## 解决的问题
- 新增脑图节点跨分支拖拽吸附判定，拖动过程中只做候选预览，不提前改树结构。
- 在松开左键时根据候选目标执行 `moveTopic` 重挂；未命中任何有效目标时继续沿用自由拖动并写入 offset。
- 修正 `moveTopic` 的重挂语义：移动成功后重置被拖节点根的 `offsetX/offsetY`，保留 `semanticGroupKey/priority`。
- 为节点增加独立的 `dropTarget` 预览态，高亮候选父分支而不污染真实选中态。
- 补齐纯逻辑、树操作、节点组件和页面交互测试，覆盖跨分支重挂、同父重排、未命中自由拖动三条主路径。

## 问题原因
- 现有画布拖拽只会在 `mouseup` 后调用 `setTopicOffset`，因此节点只能改变视觉位置，无法改变父子关系。
- 现有树操作虽然已经具备 `moveTopic` 能力，但没有和画布拖拽的预览、命中判定、松手提交链路接通。
- 节点 UI 只有选中/激活等真实状态，没有单独承载“候选吸附目标”的本地预览态。

## 尝试的解决办法
1. 新增 `src/features/editor/drag-drop-preview.ts`，基于布局节点矩形计算候选父节点、子列落点通道和插入序号，并排除根节点、自身与后代。
2. 调整 `MapEditorPage` 的 drag session：拖动中仅更新本地 `nodes` 位置与 `dropTarget` 预览，松手后根据 `dropPreview` 分流到 `moveTopic` 或 `setTopicOffset`。
3. 更新 `tree-operations.moveTopic`，在成功重挂后归零被拖节点根的 offset，并补充同父重排测试。
4. 更新 `TopicNode` 与样式，增加 `data-drop-target` 及对应高亮样式。
5. 增加并跑通以下验证：
   - `npx vitest run src/features/editor/drag-drop-preview.test.ts src/features/editor/layout.test.ts src/features/editor/tree-operations.test.ts src/components/topic-node/TopicNode.test.tsx src/pages/editor/MapEditorPage.test.tsx`
   - `npm run build:web` 与 `npx tsc -p tsconfig.app.json --noEmit` 未通过，但报错位于本次未修改的既有文件。
   - `npx eslint ...` 对本次 touched 文件执行时，仍被 `src/pages/editor/MapEditorPage.tsx` 中既有 React Hooks 规则问题阻塞。

## 是否成功解决
- 状态：成功
- 说明：拖拽吸附与松手重挂功能已实现，相关测试通过；仓库范围的 build/lint 仍存在与本任务无关的历史错误。

## 相关文件
- src/features/editor/drag-drop-preview.ts
- src/features/editor/drag-drop-preview.test.ts
- src/features/editor/layout.ts
- src/features/editor/tree-operations.ts
- src/features/editor/tree-operations.test.ts
- src/components/topic-node/TopicNode.tsx
- src/components/topic-node/TopicNode.module.css
- src/components/topic-node/TopicNode.test.tsx
- src/pages/editor/MapEditorPage.tsx
- src/pages/editor/MapEditorPage.test.tsx

## 遗留问题/下一步
- 若后续希望支持“拖回根节点下”或“多选节点一起重挂”，需要继续扩展候选目标与批量结构移动语义。
- 仓库当前仍有既有 TypeScript / ESLint 问题阻塞全量 `build:web` 与文件级 lint，需要单独清理。
