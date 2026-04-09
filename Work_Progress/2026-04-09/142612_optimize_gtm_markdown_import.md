# 任务记录

## 任务名称
- 优化 GTM Markdown 导入脑图生成逻辑

## 执行时间
- 开始时间：2026-04-09 14:26:12
- 结束时间：2026-04-09 14:35:12

## 仓库根目录
- C:\Users\Administrator\Desktop\BrainFlow

## 任务目标
- 修复 GTM_main.md 生成脑图时语义分类偏向 rgument/evidence、节点标题重复、source anchors 丢失的问题。
- 让中文 GTM 方法论文档更稳定生成方法/操作指南型脑图。

## 解决的问题
- 修复中文语义关键词规则中残留的乱码字面量，恢复“原则、标准、策略、方案、结论、修复、预防、原理、分类”等中文识别。
- 收紧 metric 判定，避免 5-8、编号标题等裸数字把中文方法论内容误判为数据/指标。
- 将 GTM 方法论长文从低置信 rgument 调整为更合适的 method，减少证据节点主导画布的问题。
- 过滤“说明、对话记录、用户、助手、备注”等对话归档包装字段，避免它们进入主干。
- 修复 TextImportNodePlan.sourceAnchors -> KnowledgeSemanticNode.source_refs -> projection.sourceAnchors 的传递，导入预览重新具备来源行号。
- 改善 evidence/criterion/task 等长标题压缩策略，避免统一显示为“证据”。

## 问题原因
- 已确认根因包括：中文关键词正则在 shared/text-import-semantics.ts 中存在 mojibake；isMetricText 把任意数字当 metric；argument scorer 对 evidence 权重过高；planner fallback graph 丢弃 sourceAnchors；semantic title 压缩对 evidence 使用过度泛化标题。

## 尝试的解决办法
1. 创建任务记录，准备开始代码实现与回归测试。
2. 修复 shared/text-import-semantics.ts 中多处乱码中文关键词规则，并收紧 metric 对裸数字的误判。
3. 在 semantic unit 规划前过滤对话归档包装字段，避免说明/用户/助手/备注进入主干。
4. 调整中文方法论 archetype scoring：提高“具体怎么做、步骤、筛选表、判断、打分、建议下一步”等 method 信号，降低 evidence 对 argument/postmortem 的泛化权重。
5. 修复 shared/text-import-layering.ts 的 source_refs 生成，并让 semantic projection 能恢复 sourceAnchors。
6. 改善长标题压缩，保留 evidence/criterion 的语义短标题，不再统一压成“证据”。
7. 补充 shared/text-import-semantics.test.ts 和 src/features/import/local-text-import-core.test.ts 的中文与 GTM 回归断言。
8. 运行 `npm test -- shared/text-import-semantics.test.ts shared/text-import-layering.test.ts src/features/import/local-text-import-core.test.ts`，17 个测试通过。
9. 运行 `npx tsc -b --pretty false`，类型检查通过。

## 是否成功解决
- 状态：成功
- 说明：最小回归测试与 TypeScript 构建均通过；快速预览显示 GTM_main.md 自动归类为 method，sourceAnchorCount 恢复为非零，重复“证据”节点和 evidence-heavy 质量告警消失。

## 相关文件
- shared/text-import-semantics.ts
- shared/text-import-layering.ts
- shared/text-import-semantics.test.ts
- src/features/import/local-text-import-core.test.ts
- docs/test_docs/GTM_main.md
- C:\Users\Administrator\Downloads\未命名脑图 (1).json

## 遗留问题/下一步
- 当前 GTM 预览仍可能出现“检验标准”分支较密的质量提示，但主要怪异问题已修复；后续如要进一步增强，可做按 H3 章节和四维判断维度的更细粒度分组。
- 工作区中存在多项本轮开始前已有的未提交改动，未做处理。
