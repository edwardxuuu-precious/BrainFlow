# 任务记录

## 任务名称
- 修复 GTM 导入重复、固定模板重建与批量层级丢失问题

## 执行时间
- 开始时间：2026-04-08 22:06:34
- 结束时间：2026-04-08 22:43:25

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 移除 GTM 文档的固定模板特化路径，恢复通用导入规划链路。
- 让批量导入按文件名层级保留 `GTM_main -> GTM_step1 -> GTM_step1-1` 递进结构。
- 修复语义图规范化时按 `type + title` 全局合并节点导致的同名节点串线与 note 重复。
- 为历史错误 GTM bundle 提供基于已保存 source 的一键修复入口。

## 解决的问题
- GTM 文档不再被强制改写成固定 15 节点模板。
- 批量导入不再把多文件内容压成一个统一 GTM 模板，而是保留文件包装节点和父子层级。
- 同名节点如“判断标准 / 证据问题 / 常见误判”不再跨分支错误合并。
- 导入弹窗新增“修复当前导入”按钮，可对旧版 GTM bundle 进行本地重建并替换已挂载子树。
- 新增回归测试覆盖单文件 GTM、批量层级、同名节点隔离、历史修复入口与修复按钮展示。

## 问题原因
- `shared/text-import-layering.ts` 里存在 GTM 关键词命中后直接走固定模板建图的特殊逻辑。
- `canonicalizeSemanticGraph(...)` 通过 `type:title` 做全局去重，导致不同父节点下的同名语义节点被误合并。
- 批量导入虽先生成了每文件 preview，但后续又重新对整批 raw sources 做了一次 bundle preview，覆盖了文件层级树。
- 历史错误 bundle 没有修复入口，只能继续沿用错误挂载结果。

## 尝试的解决办法
1. 删除 GTM 特化模板路径，`buildImportBundlePreview(...)` 统一改走通用 planner/fallback 逻辑。
2. 重写 `canonicalizeSemanticGraph(...)`，保留节点 ID，只做文本清洗、source ref 去重和 edge 去重，不再全局按标题并节点。
3. 重写 `src/features/import/text-import-batch-compose.ts`，按文件名解析层级关系，显式构建文件包装节点，再直接从该树派生 semantic graph 与 thinking view。
4. 调整 `createThinkingProjection(...)`，取消旧的深度/数量裁剪，保证批量文件层级在 thinking view 中可见。
5. 在 `local-text-import-core.ts` 中让本地批量导入直接复用新的批量组合器，而不是重新按整批原文生成统一 bundle。
6. 在 `knowledge-import.ts` 中新增 legacy GTM bundle 探测与 `repairKnowledgeImportBundle(...)` 本地重建逻辑。
7. 在 `TextImportDialog` 和 `MapEditorPage` 中接入“修复当前导入”按钮、可修复状态说明和执行入口。
8. 新增/更新 Vitest 回归测试，并通过 `npm run build:web` 验证 TypeScript 与 Vite 生产构建。

## 是否成功解决
- 状态：成功
- 说明：核心逻辑、历史修复入口、UI 入口、测试和构建均已完成并通过验证。

## 相关文件
- shared/text-import-layering.ts
- shared/text-import-layering.test.ts
- src/features/import/text-import-batch-compose.ts
- src/features/import/local-text-import-core.ts
- src/features/import/local-text-import-core.test.ts
- src/features/import/knowledge-import.ts
- src/features/import/knowledge-import.test.ts
- src/features/import/components/TextImportDialog.tsx
- src/features/import/components/TextImportDialog.test.tsx
- src/pages/editor/MapEditorPage.tsx

## 遗留问题/下一步
- 当前只提供“手动点击修复当前导入”的修复方式，未做文档打开时的隐式自动迁移。
- 旧 bundle 若缺少可用 `raw_content`，仍无法自动修复，只能重新导入。
- 如后续需要，可再补一轮更大范围的全量测试或真实交互回归。
