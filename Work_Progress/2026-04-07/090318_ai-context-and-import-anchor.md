# 任务记录

## 任务名称
- 让 AI 上下文选择与导入锚点真正生效

## 执行时间
- 开始时间：2026-04-07 09:03:18
- 结束时间：2026-04-07 09:25:27

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 将 AI 上下文选择真正接入请求构建与服务端提示。
- 将导入锚点从理解锚点改为真实插入位置，并贯穿预览到应用阶段。

## 解决的问题
- AI 对话请求现在会真实读取“整张脑图 / 裁剪子图 / 空上下文”三种上下文范围。
- AI 侧边栏的手动上下文、画布当前选区、从画布点选模式已经接入真实请求构建与展示。
- 文本导入的 anchorTopicId 已贯穿本地导入、批量导入、语义合并和最终 apply，结构节点会落到锚点下。
- 预览应用时如果原锚点已不存在，会回退到根节点并提示 warning，不再静默挂错位置。

## 问题原因
- AI 面板中的 useFullDocument 和 aiContextTopicIds 之前只停留在 UI 状态，发送消息时仍然只传当前选区，并且 buildAiContext 总是序列化整张脑图。
- 文本导入虽然在请求和 prompt 中带了 anchorTopicId，但所有基于 previewNodes 的 create_child 重编译都硬编码到了 rootTopicId。
- 预览响应对象本身没有稳定保存 anchorTopicId，导致预览编辑和最终 apply 阶段无法复用同一个插入锚点。

## 尝试的解决办法
1. 扩展 AiSelectionContext，新增 scope；重写 buildAiContext，支持 full_document、focused_subset、empty，并在 focused_subset 下只保留根节点、焦点节点及祖先链。
2. 修改 MapEditorPage、AiSidebar、AiContextTray、ai-store，把“手动上下文 ∪ 画布选区”真正接入 AI 请求，同时补可取消的画布 picking 流程。
3. 修改 server/codex-bridge 的 chat/planning prompt，根据 scope 切换指导语，避免 focused_subset 和 empty 仍按整图理解。
4. 扩展 TextImportResponse，显式保存 anchorTopicId；新增 previewNodes -> create_child 的统一编译函数，并让 local import、batch compose、semantic merge、apply 全部复用。
5. 补充并更新 AI 上下文、导入锚点、服务端 prompt 的单元测试和类型检查。

## 是否成功解决
- 状态：成功
- 说明：功能实现完成，相关定向测试通过，TypeScript 构建通过。

## 相关文件
- shared/ai-contract.ts
- shared/text-import-semantics.ts
- src/features/ai/ai-context.ts
- src/features/ai/ai-store.ts
- src/features/ai/components/AiContextTray.tsx
- src/features/ai/components/AiSidebar.tsx
- src/pages/editor/MapEditorPage.tsx
- server/codex-bridge.ts
- src/features/import/local-text-import-core.ts
- src/features/import/text-import-batch-compose.ts
- src/features/import/text-import-semantic-merge.ts
- src/features/import/text-import-apply.ts
- src/features/import/text-import-store.ts
- src/features/editor/editor-store.ts

## 遗留问题/下一步
- 当前工作区仍有大量与本任务无关的未提交改动，后续提交时需要单独梳理范围。
- 如需进一步提升可用性，可考虑把 AI 面板的上下文状态持久化到会话或文档级 UI 状态中。
