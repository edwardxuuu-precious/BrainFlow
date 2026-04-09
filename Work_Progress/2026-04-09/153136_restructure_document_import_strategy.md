# 任务记录

## 任务名称
- 重构文档导入为逻辑树结构图生成策略

## 执行时间
- 开始时间：2026-04-09 15:31:36 +08:00
- 结束时间：2026-04-09 16:12:58 +08:00

## 仓库根目录
- C:\Users\Administrator\Desktop\BrainFlow

## 任务目标
- 将 Markdown 文档导入从固定模板脑图重构为按原文语义生成的“逻辑树 + 证据挂载 + 任务提取”结构图。

## 解决的问题
- 已处理：将文档导入从固定模板分支改为按 Markdown 原文顺序生成文档结构图，降低“证据/数据/分论点”等占位节点，并补齐 source span 与任务 output 字段。

## 问题原因
- 已确认：共享语义规划仍以 archetype/templateSlot 为主，投影层也会把旧 semantic type 映射为 topic/project/criterion 等类型；包装标题过滤和 source refs 传递不足会让对话归档内容或空 anchors 干扰最终预览。

## 尝试的解决办法
1. 已创建任务记录，检查现有导入链路、共享类型、投影、存储与测试。
2. 已重构共享类型、文档类型诊断、document-structure planner、投影层语义归一化与任务 output 字段。
3. 已更新 server/storage 兼容归一化、批量导入 wrapper 摘要和 Codex 导入提示词。
4. 已补充 GTM 与 SOP/研究/计划/会议纪要回归测试，并运行最小回归和 TypeScript 构建。

## 是否成功解决
- 状态：成功
- 说明：最小回归测试与 TypeScript 构建均已通过；GTM 抽查显示顶层主干为“结论 / 拆解 / 建议下一步”，无通用“证据/数据/分论点”占位标题，source anchors 非空。

## 相关文件
- shared/ai-contract.ts
- shared/text-import-semantics.ts
- shared/text-import-layering.ts
- server/codex-bridge.ts
- src/features/storage/adapters/indexeddb/legacy-document-local-service.ts
- src/features/import/text-import-batch-compose.ts
- src/features/import/local-text-import-core.test.ts
- shared/text-import-semantics.test.ts
- shared/text-import-layering.test.ts

## 遗留问题/下一步
- 可继续根据真实长文样本微调 task 严格提取阈值与节点预算，但本轮目标已完成并通过验证。
