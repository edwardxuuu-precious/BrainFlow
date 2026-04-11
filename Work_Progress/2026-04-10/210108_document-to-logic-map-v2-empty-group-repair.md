# 任务记录

## 任务名称
- document-to-logic-map/v2 空 Group 消除 + 通用孙节点兜底

## 执行时间
- 开始时间：2026-04-10 21:01:08 +08:00
- 结束时间：2026-04-10 21:52:00 +08:00

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 修复 live import 的 v2 judgment tree 中 `判断依据` / `潜在动作` 空壳分组问题，补充通用 structural repair、质量警告与 thinking projection 空 group 过滤，并同步更新 skill、examples 与测试。

## 解决的问题
- live import 的 `document-to-logic-map/v2` 缺少 judgment-tree structural repair，空的 `judgment_basis_group` / `potential_action_group` 会被直接放进 preview。
- thinking projection 会完整保留 judgment-tree grandchildren，但此前不会过滤空的 basis/action group，导致画布出现重复的空盒子。
- 质量警告只覆盖通用 preview 质量问题，没有覆盖 judgment-tree 的“空 group / 缺少 core child / 长 note 代替 grandchildren”。
- 缺少非 GTM 的修复样例，容易让行为看起来像对 GTM 过拟合。

## 问题原因
- 服务端当前只做 schema、重复 id、父子引用和泛标题等通用校验，没有对 v2 固定骨架下的空 group 做结构补全。
- 画布节点卡片只展示本节点 note，不会自动把 basis/task 孙节点内联到 group 卡片里；一旦 group 自己没 note 且无子节点，就会显得完全为空。
- v2 prompt 虽然要求 basis/action grandchildren，但缺少“空 group 不得放行”的更硬约束与后处理兜底。

## 尝试的解决办法
1. 在 `server/codex-bridge.ts` 的 `normalizeDocumentToLogicMapPayload(...)` 中新增通用 judgment-tree structural repair，基于 `structure_role`、父子关系、group note、source spans、preprocessed hints 与 semantic hints 自动补 `core_judgment` / `basis_item` / `action_item` 或 `task` 子节点。
2. 为 repair 增加通用 note-to-children 拆分与 source-grounded action/task 判定，避免按 GTM 模块名写死逻辑。
3. 在 `shared/text-import-semantics.ts` 中新增 judgment-tree 专项 warning，覆盖空 basis/action group、缺少 core child、以及用长 note 代替 grandchildren 的情况。
4. 在 `shared/text-import-layering.ts` 中隐藏空的 `judgment_basis_group` / `potential_action_group`，保留非空 group 与 grandchildren。
5. 更新 skill、task-rules，并新增非 GTM `notes-source.md` / `notes-expected.json` 例子，强调这套协议是通用结构规则。
6. 补充 `server/codex-bridge.test.ts` 与 `shared/text-import-layering.test.ts`，覆盖 repair、source-grounded task 边界、空 group thinking 过滤。

## 是否成功解决
- 状态：成功
- 说明：已完成代码修改、文档更新与回归测试，能够对 live import 中的空 basis/action group 做通用补全或隐藏，不再把空壳 group 直接暴露到 thinking view。

## 相关文件
- server/codex-bridge.ts
- shared/text-import-layering.ts
- shared/text-import-semantics.ts
- server/codex-bridge.test.ts
- shared/text-import-layering.test.ts
- .agents/skills/document-to-logic-map/SKILL.md
- .agents/skills/document-to-logic-map/references/task-rules.md
- .agents/skills/document-to-logic-map/references/examples/notes-source.md
- .agents/skills/document-to-logic-map/references/examples/notes-expected.json

## 遗留问题/下一步
- 旧文档如果不重新导入，无法凭空生成历史上不存在的 basis/task grandchildren；只能依赖新的 thinking projection 隐藏空 group。
- 后续可以考虑把 judgment-tree warnings 暴露到导入 UI，帮助用户区分“已自动修复”与“仍需人工补结构”的情况。
