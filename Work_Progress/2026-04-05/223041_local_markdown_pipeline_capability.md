# 任务记录

## 任务名称
- 解释本地 Markdown 导入能力与适用范围

## 执行时间
- 开始时间：2026-04-05 22:30:41
- 结束时间：2026-04-05 22:35:58

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 结合代码解释“本地解析导入”具体含义，并判断当前本地规则是否足以处理用户上传文档生成脑图节点。

## 解决的问题
- 已确认“本地解析导入”的真实含义：
- 单文件导入时，若文件名为 `.md/.markdown`，或文本中存在明显 Markdown 结构（至少 3 个标题/列表提示，或至少 1 个 ATX 标题），则走本地 Markdown pipeline。
- 本地 pipeline 的核心能力是把 Markdown AST 结构转成脑图节点层级，主要识别 `heading`、`list`、`task_list`、`table`、`blockquote`、`code block`、`paragraph`。
- 如果文档没有形成 Markdown 层级结构，本地 pipeline 不会主动“理解全文并拆出多个语义节点”，而是可能只生成一个以文件名或首行为标题的兜底节点，并把全文放进 note。
- 本地 pipeline 中的“semantic”主要用于：
- 1) 判断导入节点是否与现有 topic 语义重合并做安全 merge；
- 2) 批量导入时识别跨文件重复节点。
- 这些 semantic candidate 先由本地启发式生成，再调用 `/api/codex/import/adjudicate` 做 adjudication；若失败，则退回本地 heuristics。
- 对非 Markdown 结构化文本，单文件导入会回退到 Codex import preview。
- 当前文件上传入口没有文件类型限制，但实现使用 `file.text()` 读取内容，因此实际上只适合纯文本文件；PDF、Word 等二进制文档不属于当前可靠支持范围。

## 问题原因
- 用户不确定“本地解析导入”是否只是简单规则匹配，担心无法对上传文档进行语义理解并正确生成脑图节点。

## 尝试的解决办法
1. 创建本轮任务记录文件。
2. 阅读 `text-import-job.ts`，确认单文件会先判断是否走 `local_markdown`，否则回退 `codex_fallback`。
3. 阅读 `local-text-import-core.ts`，确认本地 pipeline 使用 `remark-parse`/`remark-gfm` 解析 Markdown AST 并构建树形节点。
4. 阅读 `text-import.worker.ts` 与 `text-import-client.ts`，确认 semantic adjudication 会调用 `/api/codex/import/adjudicate`，失败时回退本地 heuristics。
5. 阅读 `MapEditorPage.tsx` 与 `text-import-store.ts`，确认上传文件通过 `file.text()` 读取，未见 PDF/Word 专门解析逻辑。

## 是否成功解决
- 状态：成功
- 说明：已确认本地 pipeline 的适用前提、能力边界、与 Codex 的分工，以及上传文件类型上的实际限制。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\local-text-import-core.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-job.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import.worker.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-client.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.ts
- C:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx
- C:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-05\223041_local_markdown_pipeline_capability.md

## 遗留问题/下一步
- 如果希望“上传任意长文后自动抽取层级并生成脑图节点”，需要补一条真正的文档理解链路，而不是仅依赖 Markdown AST 解析。
- 可考虑后续增加：PDF/DOCX 提取、长文 chunking、基于 LLM 的层级摘要/节点抽取，再接入当前安全 apply 与 semantic merge 机制。
