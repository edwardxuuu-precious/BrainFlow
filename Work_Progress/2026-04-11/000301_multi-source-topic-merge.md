# 任务记录

## 任务名称
- document-to-logic-map/v2 多来源同主题归并（单 Canonical Root）实现

## 执行时间
- 开始时间：2026-04-11 00:03:01
- 结束时间：2026-04-11 00:32:18

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 在 batch 主链路实现同主题多来源归并，确保 thinking view 只保留一个 canonical root，并保留多来源 archive/provenance 可追溯。

## 解决的问题
- 实现 batch 导入下“同主题多来源归并”，避免每个来源都生成并列 root。
- 引入并贯通来源职责字段 `source_role`，区分 `canonical_knowledge / context_record / supporting_material`。
- 引入并贯通同主题归并字段 `canonical_topic_id / same_as_topic_id / merge_mode / merge_confidence / semantic_fingerprint`。
- 实现 context_record 与 canonical 高重合时的增量注入（basis/task/action）与冲突挂载，不再创建第二棵 root。
- 重建语义裁决后的投影视图，保证 thinking 层只保留单 canonical root，archive/provenance 保留多来源可追溯。

## 问题原因
- 旧链路按“每文档一棵树”构建主图，缺少跨文档同主题判定与来源职责建模。
- 旧 schema/contract 未携带 merge 元数据，bridge 与存储层无法稳定传递、回放和回填该信息。
- 旧投影逻辑未在语义裁决后基于“归并后语义图”重建，导致并列语义等价 root 继续可见。

## 尝试的解决办法
1. 扩展 skill 文档与 input/output schema，新增并规范 merge/source 字段，并在 bridge schema 与 prompt 中强约束输出。
2. 在 shared contract、layering、legacy hydrate 中补齐读写路径与默认回填，保证旧数据兼容。
3. 在 batch compose 中加入来源角色判定、语义指纹稳定哈希、同主题综合评分与 merge mode 决策。
4. 在 batch compose 中对 `merge_into_existing` 做 context_record 增量注入（basis/task/action）与冲突注记。
5. 在 semantic adjudication 末端重建 semanticNodes/semanticEdges/viewProjections，保证 thinking 只保留 canonical root。
6. 更新 GTM_main + GTM_step1 fixture 与相关单测，验证“单 root + 双来源追溯 + 元数据完整”。
7. 运行 vitest 关键用例与 tsc 编译检查，确认无类型与行为回归。

## 是否成功解决
- 状态：成功
- 说明：已按本轮目标完成跨文档同主题归并主链路改造（batch 路径），GTM_main + GTM_step1 场景下 thinking 仅保留一个 canonical root，context_record 不再生成第二棵并列 root，archive/provenance 保留两份来源。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\.agents\skills\document-to-logic-map\SKILL.md
- C:\Users\edwar\Desktop\BrainFlow\.agents\skills\document-to-logic-map\references\input.schema.json
- C:\Users\edwar\Desktop\BrainFlow\.agents\skills\document-to-logic-map\references\output.schema.json
- C:\Users\edwar\Desktop\BrainFlow\shared\ai-contract.ts
- C:\Users\edwar\Desktop\BrainFlow\shared\text-import-layering.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\storage\adapters\indexeddb\legacy-document-local-service.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-batch-compose.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-semantic-merge.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-semantic-adjudication.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\local-text-import-core.ts
- C:\Users\edwar\Desktop\BrainFlow\docs\test_docs\GTM_main+GTM_step1.document-to-logic-map.v2.batch.json
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-semantic-merge.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-job.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\local-text-import-core.test.ts

## 遗留问题/下一步
- 当前主要覆盖 batch 主链路；后续可将同主题归并策略扩展到非 batch 或在线增量导入路径。
- 可继续补充更多跨主题边界样例（低重合但高词面相似）以优化误归并阈值。
