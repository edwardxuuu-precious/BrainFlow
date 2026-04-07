# 任务记录

## 任务名称
- 导入质量优化方案落地

## 执行时间
- 开始时间：2026-04-06 19:52:32
- 结束时间：2026-04-06 20:32:22

## 仓库根目录
- `C:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 按既定方案落地导入质量优化首轮改造。
- 将导入流程从“直接由 local / Codex 产最终树”调整为“共享语义单元与节点计划，再由确定性编排器产出预览节点与操作”。
- 补齐导入意图、内容画像、语义提示、预览内编辑、语义化展示提示和相关测试。

## 解决的问题
- 为 `TextImportRequest`、`TextImportPreviewItem`、`AiCanvasOperation`、`AiTopicMetadata` 等共享契约新增导入意图、内容画像、语义提示、节点预算、语义角色、来源锚点、stickers/type、presentation hints 等字段。
- 新增 `shared/text-import-semantics.ts`，实现语义提示抽取、内容画像识别、节点预算解析、节点计划生成、节点计划编译、质量告警生成。
- 重构本地导入流程：`local-text-import-core.ts` 先生成 `ImportNodePlan[]`，再统一编译为 `previewNodes/operations`；batch 也改为统一编排。
- 重构 Codex 导入桥：`codex-bridge.ts` 支持 `nodePlans` 优先返回，支持 `presentation`、`semanticRole`、`confidence`、`sourceAnchors` 归一化，并把质量告警并入导入结果。
- 导入状态仓库增加 `importPreset` 与预览编辑能力，支持重命名、提升层级、降级到前一兄弟节点、删除预览节点。
- 导入弹窗增加导入预设、语义角色/置信度展示和预览内编辑入口，并接入页面层。
- `applyPreview` 改为根据当前预览树重新编译结构性 `create_child` 操作，保证预览编辑能真实影响落图结果。
- 画布主题节点布局与提案应用流程补充 `semanticGroupKey`、`priority`、`collapsedByDefault`、`metadata.type/stickers` 的承接。
- 修复 `shared/text-import-semantics.ts` 的 node16 import 后缀与隐式 any，确保 `build:server` 通过。
- 顺手清理 `TopicRichTextEditor.tsx` 中两个未使用片段，确保 `tsconfig.app` 和 `build:web` 通过。

## 问题原因
- 原有本地导入偏向 Markdown 结构搬运，缺少“语义规划层”，因此结构清晰但脑图质量不高。
- 原有 Codex 导入偏向一次性输出 `previewNodes/operations`，更重视 JSON 合法性和安全应用，缺少稳定的语义后处理与确定性编排。
- 共享契约中没有表达导入意图、语义角色、来源锚点、展示提示等信息，导致本地、服务端、UI、画布之间难以协同优化结果质量。
- 预览 UI 只能查看不能编辑，用户对结构不满意时只能整轮重跑，无法在预览阶段快速修正。

## 尝试的解决办法
1. 扩展共享类型，定义导入意图、内容画像、语义提示、节点计划、语义角色、展示提示等基础模型。
2. 新增共享语义编排模块，把“从提示抽语义”和“从节点计划编译预览/操作”沉到确定性逻辑中。
3. 调整 local pipeline，在 `preserve_structure` 与 `distill_structure` 下分别走结构保真和语义提炼两条计划生成路径。
4. 调整 Codex bridge 的 schema、prompt 和 payload 归一化，优先消费 `nodePlans`，并补上质量告警。
5. 在 store、dialog、page、apply 链路接入导入预设与预览内编辑，使用户可以在应用前直接修树。
6. 更新导入相关测试 fixture 与断言，使其匹配新的 request contract 与“统一加法落图”行为。
7. 跑通导入相关 Vitest、`build:server`、`tsconfig.app` 和 `build:web`，并修正编译过程中暴露的问题。

## 是否成功解决
- 状态：成功
- 说明：方案首轮落地完成，核心导入链路、UI、服务端和画布承接均已接通；导入相关测试与前后端构建验证通过。

## 相关文件
- `shared/ai-contract.ts`
- `shared/text-import-semantics.ts`
- `src/features/import/local-text-import-core.ts`
- `src/features/import/text-import-store.ts`
- `src/features/import/text-import-apply.ts`
- `src/features/import/text-import-preview-edit.ts`
- `src/features/import/text-import-batch-compose.ts`
- `src/features/import/components/TextImportDialog.tsx`
- `src/features/import/components/TextImportDialog.module.css`
- `src/pages/editor/MapEditorPage.tsx`
- `server/app.ts`
- `server/codex-bridge.ts`
- `src/features/ai/ai-proposal.ts`
- `src/features/documents/types.ts`
- `src/features/editor/layout.ts`
- `src/features/editor/components/TopicRichTextEditor.tsx`
- `server/app.test.ts`
- `server/codex-bridge.test.ts`
- `src/features/import/local-text-import-core.test.ts`
- `src/features/import/text-import-job.test.ts`
- `src/features/import/text-import-semantic-merge.test.ts`
- `src/features/import/text-import-client.test.ts`
- `src/features/import/components/TextImportDialog.test.tsx`

## 遗留问题/下一步
- 目前预览内编辑只覆盖重命名、提升、降级、删除；“拖拽归类、合并、拆分”还未实现。
- Codex 导入虽然已切换到 `nodePlans` 优先，但语义质量 repair 仍偏轻，下一轮可继续补“重复节点、泛标题、层级爆炸、长 note 倾倒”自动修正。
- 画布布局目前只承接了 `priority/groupKey/collapsedByDefault` 的基础语义提示，后续可继续加强不同语义角色的视觉差异与批量容器展示。
- 多文件 cross-file merge 在首轮改造中保持保守策略，尚未重新启用基于“语义角色 + 证据”的自动合并结果。
