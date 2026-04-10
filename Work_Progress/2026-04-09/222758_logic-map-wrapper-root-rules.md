# 任务记录

## 任务名称
- 为 `document-to-logic-map` 增补 wrapper heading、root selection、analysis projection 规则

## 执行时间
- 开始时间：2026-04-09 22:27:58 +08:00
- 结束时间：2026-04-09 22:39:30 +08:00

## 仓库根目录
- `C:/Users/edwar/Desktop/BrainFlow`

## 任务目标
- 将用户新增的 source normalization、root selection、analysis projection 与 hard prohibitions 规则落到 skill、Codex prompt、共享 projection 逻辑和回归测试中。

## 解决的问题
- 新增了 wrapper / semantic / archival 标题分类规则，并禁止 wrapper heading 成为 thinking view 的可见主脊。
- 为 thinking view 增加了语义根节点选择逻辑，避免默认把文档标题或容器节点作为 root。
- 为 `analysis` 文档增加了广度优先投影规则，保证 4-8 个一级语义分支不会被压成单分支，并限制每个一级分支只暴露 1-3 个代表性子节点。
- 将这些约束同步到 `document-to-logic-map` skill 说明和 `server/codex-bridge.ts` 的导入 prompt 中。
- 补充了 projection 与 prompt 的回归测试。

## 问题原因
- 现有 skill 文案只覆盖基础节点类型与 task/evidence 规则，没有明确约束 wrapper heading、source-outline 节点与 root 选择。
- `shared/text-import-layering.ts` 的 thinking view 采用“选一个 center 然后整棵深度展开”的策略，容易把 analysis 文档收缩成单主分支，也可能让容器标题重新进入主脊。

## 尝试的解决办法
1. 在 `shared/text-import-layering.ts` 中新增标题分类、root 打分选择、wrapper 展开过滤、analysis 广度优先投影与二级子节点裁剪逻辑。
2. 在 `.agents/skills/document-to-logic-map/SKILL.md` 中补充 source normalization、root selection、analysis projection 和 hard prohibitions 的正式规则。
3. 在 `server/codex-bridge.ts` 的 `buildDocumentToLogicMapPrompt` 中加入同样的行为约束，并在 projection 编译处传入 document type。
4. 在 `shared/text-import-layering.test.ts` 与 `server/codex-bridge.test.ts` 中新增回归测试，覆盖 wrapper 抑制、semantic root 选择、analysis 广度投影和 prompt 文案。
5. 运行 `npm test -- shared/text-import-layering.test.ts server/codex-bridge.test.ts` 与 `npx tsc -p tsconfig.json --noEmit` 验证改动。

## 是否成功解决
- 状态：成功
- 说明：规则已写入 skill、prompt 和共享 projection 逻辑；相关测试与 TypeScript 检查均通过。

## 相关文件
- `.agents/skills/document-to-logic-map/SKILL.md`
- `server/codex-bridge.ts`
- `server/codex-bridge.test.ts`
- `shared/text-import-layering.ts`
- `shared/text-import-layering.test.ts`
- `Work_Progress/2026-04-09/222758_logic-map-wrapper-root-rules.md`

## 遗留问题/下一步
- 当前规则已覆盖 skill-backed import 主链路，但如果后续要彻底清理旧的 legacy 本地导入代码，还需要把相同约束继续下沉到残留 fallback 路径中。
