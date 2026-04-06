# 任务记录

## 任务名称
- 导入运行时解释器与 stderr 诊断分层

## 执行时间
- 开始时间：2026-04-06 09:51:00
- 结束时间：2026-04-06 10:17:00

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 为 Codex 导入链路增加 `Runtime explainer`，回答“现在在做什么、为什么还没结束、依据是什么”。
- 将 Codex `stderr` 逐行采集并分类为 `noise`、`capability_gap`、`actionable`，只进入 diagnostics，不污染主时间线。
- 保留真实 `Codex live feed`，不伪造不存在的 CLI 事件。

## 解决的问题
- 新增导入流事件 `codex_explainer` 与 `codex_diagnostic`，前后端链路全部打通。
- Codex runner 现在支持逐行转发 `stderr`，bridge 会对常见警告做分类并输出结构化诊断。
- 导入弹窗主视图改为“上层解释器 + 下层真实事件流”，并将快阶段与 stderr 分类收进折叠的 `Import diagnostics`。
- 解决了本轮改动带出的构建问题，最终 `pnpm build` 通过。

## 问题原因
- `codex exec --json --ephemeral` 的真实 stdout 事件很稀疏，单靠 CLI 事件本身无法回答“正在读什么、为什么没结束”。
- 原链路没有采集 `stderr`，也没有一层基于已观测信号的确定性解释器，所以 UI 只能显示等待或 heartbeat。
- 前端主视图之前把瞬时阶段和长时间等待混在一起，用户无法区分“真实事件”和“推断解释”。

## 尝试的解决办法
1. 扩展 [ai-contract.ts](C:\Users\edwar\Desktop\BrainFlow\shared\ai-contract.ts) 的导入流协议，新增 `TextImportCodexExplainer`、`TextImportCodexDiagnostic` 和对应的流事件。
2. 修改 [codex-runner.ts](C:\Users\edwar\Desktop\BrainFlow\server\codex-runner.ts)，让结构化执行路径支持 `onStderrLine`，按行采集 `stderr`。
3. 在 [codex-bridge.ts](C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts) 增加：
   - `stderr` 分类器
   - 基于阶段、真实事件、heartbeat 和上下文规模的确定性运行时解释器
   - `codex_explainer` / `codex_diagnostic` 事件发射逻辑
4. 在 [app.ts](C:\Users\edwar\Desktop\BrainFlow\server\app.ts)、[text-import-job.ts](C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-job.ts)、[text-import-store.ts](C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.ts) 中透传并持久化新事件。
5. 在 [TextImportDialog.tsx](C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx) 和 [TextImportDialog.module.css](C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.module.css) 中重做导入状态区：
   - 顶部 `Runtime explainer`
   - 中部 `Codex live feed`
   - 底部折叠 `Import diagnostics`
6. 顺手修复构建阻塞项：
   - [MarkersPanel.tsx](C:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\MarkersPanel.tsx)
   - [PropertiesPanel.test.tsx](C:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.test.tsx)
   - [TopicRichTextEditor.tsx](C:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\TopicRichTextEditor.tsx)
7. 运行导入链路相关测试与完整构建验证。

## 是否成功解决
- 状态：成功
- 说明：
  - 导入相关测试全部通过。
  - `pnpm build` 通过。
  - 保留一条既有 Vite 警告：`MapEditorPage` chunk 大于 500 kB，本轮未处理。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\shared\ai-contract.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-runner.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts
- C:\Users\edwar\Desktop\BrainFlow\server\app.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-job.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.module.css
- C:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\MarkersPanel.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.test.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\TopicRichTextEditor.tsx

## 遗留问题/下一步
- 当前解释器仍然是“基于外部信号的推断”，不是模型内部真实思维；如果后续还需要更细的过程感知，只能再加第二通道说明，而不是继续从现有 JSON 事件里硬挖。
- `codex exec --json --ephemeral` 的真实 stdout 事件依旧稀疏，解释器价值主要体现在“解释沉默原因”和“区分生成阶段/解析阶段/修复阶段”。
- 如需进一步降低困惑，可以继续细化 diagnostics 文案，把常见 `stderr` 原始行映射成更业务化的说明。
