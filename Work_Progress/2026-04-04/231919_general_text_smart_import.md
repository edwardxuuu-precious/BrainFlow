# 任务记录

## 任务名称
- 通用文本智能导入替代 Markdown 专用导入

## 执行时间
- 开始时间：2026-04-04 23:19:19
- 结束时间：2026-04-04 23:58:35

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 将当前 Markdown 专用导入升级为不限制输入源格式的通用文本智能导入，支持文件与粘贴文本，并修复导入错误提示与退化导入能力。

## 解决的问题
- 将 Markdown 专用导入协议泛化为通用文本导入协议，支持文件与粘贴文本。
- 新增通用文本预处理与 AI 导入预览链路，允许 `.md`、`.txt`、无扩展名文本文件以及直接粘贴文本进入同一条智能导入流程。
- 服务端导入预览改为 AI 主导整理，schema 不稳定时自动退化为“原文保留导入”，避免再次因结构不匹配直接失败。
- 前端导入弹窗、store、client 与编辑器入口改为“智能导入/文本导入”语义，并补充中文错误映射，不再裸露 `network error`。
- 修复 `TopicNode.tsx` 在本次改造中引入的 JSX/文案损坏，恢复全量测试与构建基线。

## 问题原因
- 旧实现把导入能力绑定在 Markdown 结构上，输入源格式稍有偏差就容易触发 schema 不兼容或预览失败。
- 前端错误映射过于粗糙，网络层、bridge 连接、schema 校验等问题都会退化成模糊的 `network error`。
- 通用文本导入改造过程中，`TopicNode.tsx` 被误写入乱码片段，导致测试和构建一度被 UI 文件阻塞。

## 尝试的解决办法
1. 创建任务记录并梳理现有 Markdown 导入链路。
2. 在 `shared/ai-contract.ts` 中新增 `TextImportRequest`、`TextImportResponse`、`TextImportPreprocessHint`、`TextImportFallbackMode` 等通用导入类型，并保留 Markdown 别名兼容旧调用点。
3. 在 `server/codex-bridge.ts` 中将导入 prompt 改为通用文本整理 prompt，允许 AI 自主判断输入类型，并在 schema 不兼容或结构不稳定时回退到“原文保留导入”。
4. 在 `server/app.ts` 中保留 `/api/codex/import/preview` 路径兼容，但内部请求与校验改为通用文本导入语义。
5. 新增 `src/features/import/text-import-*` 文件，分别实现通用预处理、预览 client、proposal 组装、zustand store，以及新的 `TextImportDialog`。
6. 用兼容层包装原有 `markdown-*` 文件，使旧引用点继续可用，同时将 `MapEditorPage.tsx` 工具栏入口与文件导入入口切换到“智能导入”。
7. 去掉文件选择对 Markdown 的前端限制，允许任意文本文件通过 `File.text()` 进入同一导入流程。
8. 重新恢复 `src/components/topic-node/TopicNode.tsx` 并只重放需要的状态栏增强，避免乱码 JSX 持续污染验证过程。
9. 运行定向测试、全量 `pnpm test` 与 `pnpm build:web` 验证通用文本导入与整体编辑器回归。

## 是否成功解决
- 状态：成功
- 说明：通用文本智能导入已替代 Markdown 专用导入，支持文件与粘贴文本，导入失败时具备原文保留退化路径；全量测试与前端构建均通过。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\shared\ai-contract.ts
- C:\Users\edwar\Desktop\BrainFlow\server\app.ts
- C:\Users\edwar\Desktop\BrainFlow\server\app.test.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-preprocess.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-preprocess.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-client.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-apply.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.module.css
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\markdown-preprocess.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\markdown-import-client.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\markdown-import-apply.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\markdown-import-store.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\MarkdownImportDialog.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\components\topic-node\TopicNode.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\components\topic-node\TopicNode.module.css

## 遗留问题/下一步
- 仓库内仍存在本任务之外的脏文件与未跟踪 `Work_Progress` 记录，后续提交时需要按范围单独筛选，避免把无关改动混入本次功能提交。
- `src/features/editor/components/PropertiesPanel.module.css` 与 `src/pages/editor/MapEditorPage.module.css` 在本次任务中未处理，后续如果要提交本功能，需要和用户确认是否纳入。
