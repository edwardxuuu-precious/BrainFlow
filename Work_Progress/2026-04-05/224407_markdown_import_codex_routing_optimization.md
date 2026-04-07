# 任务记录

## 任务名称
- 实现 Markdown 导入链路优化与 Codex 路由调整

## 执行时间
- 开始时间：2026-04-05 22:44:07
- 结束时间：2026-04-05 23:03:28

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 按既定方案实现 Markdown 文件默认走 Codex 导入预览、批量逐文件 Codex 编排、UI/状态文案更新，以及导入 prompt 强化。

## 解决的问题
- 已将上传的 `.md/.markdown` 单文件默认路由切换为 Codex 导入预览，不再因扩展名直接进入本地 deterministic Markdown pipeline。
- 已将内部导入模式名从 `codex_fallback` 调整为 `codex_import`，并同步更新导入弹窗提示语与状态文案。
- 已实现批量导入的新版编排：
- 对包含 Markdown 文件的 batch，逐文件串行预览；
- Markdown 文件走 Codex；
- 非 Markdown 文本文件保留本地单文件预览逻辑；
- 预览结果组装为统一 batch preview 后，再复用现有 semantic adjudication / safe apply 逻辑。
- 已实现 batch fail-fast：任一 Markdown 文件在 Codex 预览阶段失败，整个 batch 直接报错，错误信息包含失败文件名。
- 已强化服务端 text import prompt，使聊天/对话、表格、长 prose 场景默认倾向拆更细节点，同时保持原文完整保留在 note 中。
- 已补充并通过相关测试与类型检查。

## 问题原因
- 当前实现只要文件扩展名是 `.md/.markdown` 就默认走本地 Markdown 解析，面对聊天记录、长段 prose、表格型 Markdown 时容易退化成粗糙结构，不能稳定满足导入脑图节点的预期。

## 尝试的解决办法
1. 检查当前工作区状态，确认仅在导入相关文件上增量修改。
2. 抽出通用 `text-import-semantic-adjudication` helper，复用 worker 与新版 batch 主线程编排中的 semantic adjudication 逻辑，避免重复实现。
3. 新增 `text-import-batch-compose` helper，用于把逐文件单预览统一组装成现有 batch `TextImportResponse` 结构。
4. 调整 `local-text-import-core` 中的 Markdown 文件识别与本地路由判断，确保上传 Markdown 文件默认不再走本地 pipeline。
5. 重写 `text-import-job` 中的 batch 路由：
   - 含 Markdown 文件的 batch 走新版串行编排；
   - 纯非 Markdown batch 继续走原有 worker-backed 本地 batch。
6. 更新 `text-import-store` 与 `TextImportDialog` 文案，移除“fallback”表述并明确 Markdown=Codex、非 Markdown=local。
7. 更新 `server/codex-bridge` prompt，并补充 job/store/bridge 测试。
8. 运行导入相关测试与 TypeScript 编译检查，修复中途发现的类型问题。

## 是否成功解决
- 状态：成功
- 说明：核心方案已实现，相关导入测试和 TypeScript 检查均已通过。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\local-text-import-core.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-batch-compose.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-semantic-adjudication.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-job.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-job.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-client.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import.worker.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.test.ts
- C:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-05\224407_markdown_import_codex_routing_optimization.md

## 遗留问题/下一步
- 当前 batch 组装保留了逐文件 preview tree 与 update_topic 语义更新，但没有把单文件 Codex 返回的高风险 conflicts 继续透传到 batch 结果中；v1 仍以“批量安全导入 + 语义 review”为主。
- 本次未扩展 PDF/DOCX 提取链路，也未改 pasted text / `.txt` 的默认策略。
- 如后续要进一步提升效果，可继续增加：
  1. 非 Markdown pasted text 的智能分流；
  2. batch 里的 conflict 透传与 review；
  3. 更细的 Codex batch 进度提示与并发控制。
