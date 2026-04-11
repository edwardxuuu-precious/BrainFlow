# 任务记录

## 任务名称
- 对齐 `document-to-logic-map` 运行时、投影和测试到新的 fail-closed 协议

## 执行时间
- 开始时间：2026-04-11 18:57:56 +08:00
- 结束时间：2026-04-11 19:44:27 +08:00

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 修改 `document-to-logic-map` 的 bridge / import / projection / warning / test 链路，移除“空 group + fallback note”保底行为。
- 保持公开 `document-to-logic-map/v2` schema 不变。
- 同步收紧 `task-rules.md`，并验证相关测试。

## 解决的问题
- `server/codex-bridge.ts` 中 judgment group repair 不再保留 `[kept-group-note]`，改为在有 source-backed candidates 时 `auto-filled`，否则直接省略 unsupported group，并在模块变成空壳后省略整个 shell module。
- `src/features/import/text-import-batch-compose.ts` 中 merged judgment group repair 与单文件 repair 对齐，不再保留 note-only group，并增加 merged shell module 省略逻辑。
- `shared/text-import-layering.ts` 中 thinking projection 现在会隐藏所有空 judgment groups（含 `core_judgment_group`），并跳过没有 concrete descendants 的 judgment module。
- `shared/text-import-semantics.ts` 中 judgment-tree 质量告警改为对空 shell group / shell module 告警，不再把“缺少被省略的 basis/action group”当作必然失败。
- 测试基线已同步为 `[omitted-group]` / `[omitted-shell-module]` 语义，并收紧为“最终 preview 中不存在无子节点的 judgment group”。

## 问题原因
- 旧实现允许空 judgment group 通过 fallback note 存活，导致 skill 文本虽然要求稀疏发射，但 runtime 和 projection 仍会把壳节点保留下来。
- 旧测试也把 `[kept-group-note]` 当作合法结果，进一步固化了“可读 note 优先于具体 descendants”的旧行为。
- judgment projection 只隐藏 basis/action 空组，不隐藏空 `core_judgment_group` 和空 shell module，因此可见树仍可能保留壳结构。

## 尝试的解决办法
1. 在 `server/codex-bridge.ts` 中改写 prompt 和 repair 逻辑，新增 `removeSubtree` / shell-module prune，并统一 warning 前缀为 `[auto-filled]`、`[omitted-group]`、`[omitted-shell-module]`。
2. 在 `text-import-batch-compose.ts`、`text-import-layering.ts`、`text-import-semantics.ts` 中同步做 merged repair、投影过滤和质量告警对齐。
3. 更新 `server/codex-bridge.test.ts`、`text-import-semantic-merge.test.ts`、`text-import-layering.test.ts`、`text-import-job.test.ts`、`local-text-import-core.test.ts`。
4. 运行聚焦测试与模块导入校验，确认新增规则不引入解析错误。

## 是否成功解决
- 状态：部分成功
- 说明：核心 runtime / projection / warning / test 对齐已完成，聚焦测试通过；但 `server/codex-bridge.test.ts` 整个套件仍被仓库内缺失的 fixture `docs/test_docs/GTM_main.document-to-logic-map.v2.json` 阻塞，无法在本轮完成该文件的完整 suite 回归。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-batch-compose.ts
- C:\Users\edwar\Desktop\BrainFlow\shared\text-import-layering.ts
- C:\Users\edwar\Desktop\BrainFlow\shared\text-import-semantics.ts
- C:\Users\edwar\Desktop\BrainFlow\.agents\skills\document-to-logic-map\references\task-rules.md
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-semantic-merge.test.ts
- C:\Users\edwar\Desktop\BrainFlow\shared\text-import-layering.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-job.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\local-text-import-core.test.ts

## 遗留问题/下一步
- 若需要完整回归 `server/codex-bridge.test.ts`，需要先补齐或恢复 `docs/test_docs/GTM_main.document-to-logic-map.v2.json` fixture。
- `server/codex-bridge.ts` prompt 中仍保留部分旧 skeleton 文案；本轮已通过新增 fail-closed 规则覆盖行为，但后续可继续清理旧提示，避免 prompt 内部出现冲突措辞。