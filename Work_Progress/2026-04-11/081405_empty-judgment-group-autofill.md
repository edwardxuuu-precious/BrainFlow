# 任务记录

## 任务名称
- 修复判断依据/潜在动作无详细内容（自动补全子项）

## 执行时间
- 开始时间：2026-04-11 08:14:05
- 结束时间：2026-04-11 08:47:58

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 修复导入后 judgment_basis_group / potential_action_group 空壳节点问题：优先自动补全 basis_item/action_item；无法补全时保留组级可读内容并给出 warning。

## 解决的问题
- 修复 `codex-bridge` 中“无 source anchors 时无法从 hints 提取候选”导致的 basis/action 空壳问题。
- 修复 `buildDocumentToLogicMapGroupFallbackNote` / `buildBatchFallbackGroupNote` 在“候选也为空”时返回空值，造成右侧“暂无详细内容”。
- 修复 thinking 投影层对空组的隐藏逻辑：仅在“无子项且无 summary/detail”时隐藏，保留带可读 note 的组节点。
- 新增回归测试覆盖“完全无候选文本”的场景，确保不会出现“组无子项且无 note”的空壳节点。

## 问题原因
- 候选提取依赖 source span anchors；当模型输出节点缺少 anchors 时，hint 候选池直接为空。
- fallback note 逻辑对空候选返回 `null`，导致组节点无子项且无说明文本。
- thinking 投影层此前只按“无子节点”隐藏 basis/action 组，未考虑组节点是否已有可读 detail。

## 尝试的解决办法
1. 在 `server/codex-bridge.ts` 扩展候选提取：无 anchors 时允许从全局 preprocessed/semantic hints 兜底，并结合上下文关键词优先筛选相关候选。
2. 在 `server/codex-bridge.ts` 与 `src/features/import/text-import-batch-compose.ts` 的 fallback note 逻辑中加入“永不为空”策略：优先候选文本，其次模块/分组上下文，最后固定可读提示语。
3. 在 `shared/text-import-layering.ts` 调整 empty judgment group 隐藏规则：仅隐藏“无子项且 summary/detail 为空”的组。
4. 增加测试：
   - `server/codex-bridge.test.ts`：无 anchors + 无候选时 basis/action 组仍有 fallback note。
   - `src/features/import/text-import-semantic-merge.test.ts`：双来源同主题合并后，空组保留可读 note 并发出 kept-group-note warning。
5. 回归验证：
   - `npx vitest run server/codex-bridge.test.ts src/features/import/text-import-semantic-merge.test.ts src/features/import/text-import-job.test.ts src/features/import/local-text-import-core.test.ts`
   - `npx tsc -b`

## 是否成功解决
- 状态：成功
- 说明：已实现“自动补全优先、无候选则保留可读组 note”的修复；同主题合并与单 canonical root 逻辑未回退；四组指定测试与 TS 构建均通过。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-batch-compose.ts
- C:\Users\edwar\Desktop\BrainFlow\shared\text-import-layering.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-semantic-merge.test.ts

## 遗留问题/下一步
- 可进一步把“fallback note 文案”改为中文本地化并加入 diagnostics 计数（auto-filled / kept-group-note）以便 UI 侧展示修复命中情况。
