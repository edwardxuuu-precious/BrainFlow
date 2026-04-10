# 任务记录

## 任务名称
- 统一 `document-to-logic-map` 规则到主链路与遗留导入路径

## 执行时间
- 开始时间：2026-04-09 22:48:01 +08:00
- 结束时间：2026-04-09 22:55:12 +08:00

## 仓库根目录
- `C:/Users/edwar/Desktop/BrainFlow`

## 任务目标
- 将 heading 归类、root 选择、analysis 投影规则统一到 skill-backed import、legacy/local fallback、bundle hydrate 与相关回归测试中，消除导入结果分叉。

## 解决的问题
- 新增共享 `documentType` 归一化 helper，并让 skill-backed import、batch compose、本地 hydrate、legacy bundle normalize 复用同一套 document-type 传递逻辑。
- 为 bundle-only 的 legacy/hydrate 场景增加保守的 semantic-graph 推断，只在缺失显式类型时补出 `analysis` 提示，避免 thinking projection 退回旧的容器展开。
- 补充 local conversation-export 与 knowledge-import rehydrate 回归测试，确认 wrapper heading 只留在 archive view，thinking spine 保持语义 root。
- 更新 local/batch 测试到三视图模型，并把旧的“root 等于文件容器名”断言替换成语义 root 断言。

## 问题原因
- 当前工作树里主链路已有部分实现，但 knowledge-import、batch compose、legacy bundle normalize 等重编译 projection 的入口仍可能丢失 `documentType` 语义，导致规则不一致。

## 尝试的解决办法
1. 检查所有 `compileSemanticLayerViews` 与 `buildImportBundlePreview` 的调用点。
2. 在 `shared/text-import-layering.ts` 中新增 `normalizeDocumentStructureType` 和 `inferDocumentStructureTypeFromSemanticGraph`，统一 document type 的显式传递与缺省回退。
3. 将 `server/codex-bridge.ts`、`text-import-batch-compose.ts`、`knowledge-import.ts`、`legacy-document-local-service.ts` 的 projection 编译调用全部接入这两个 helper。
4. 补 conversation-export / analysis / legacy-local parity 回归测试，并同步修正 local/batch 旧断言。
5. 运行 import 与 storage 相关测试、再跑 TypeScript 检查确认没有回归。

## 是否成功解决
- 状态：成功
- 说明：主链路、legacy/local fallback、bundle hydrate 与存储恢复路径已统一到共享规则；相关测试与 TypeScript 检查均通过。

## 相关文件
- `shared/text-import-layering.ts`
- `server/codex-bridge.ts`
- `src/features/import/knowledge-import.ts`
- `src/features/import/text-import-batch-compose.ts`
- `src/features/storage/adapters/indexeddb/legacy-document-local-service.ts`
- `src/features/import/local-text-import-core.test.ts`
- `src/features/import/knowledge-import.test.ts`
- `Work_Progress/2026-04-09/224801_document-to-logic-map-unify-rules.md`

## 遗留问题/下一步
- 如果后续要把 `analysis` 之外的 `process/plan/notes` 也做更强的投影特化，建议把当前保守 fallback 从“只补 analysis”扩展成完整的 bundle-level persisted document type，而不是继续依赖推断。
