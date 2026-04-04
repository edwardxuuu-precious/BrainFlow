# 任务记录

## 任务名称
- 修正智能导入的 Codex 执行链路

## 执行时间
- 开始时间：2026-04-05 00:05:32
- 结束时间：2026-04-05 00:21:25

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 修正智能导入预览的 schema 兼容问题、Codex runner 错误透传问题，以及前端预览层对新协议的适配问题。
- 确保导入功能必须依赖真实可用的 Codex 执行结果，不再用伪成功的 fallback 掩盖失败。

## 解决的问题
- 将导入预览返回从递归 `previewTree` 改成扁平 `previewNodes`，避免 Codex CLI 对递归 schema 的兼容问题。
- 删除 `fallbackMode/raw_preserved` 退化导入路径，失败时不再伪装成功。
- 为导入增加一次自动修复重试；首次 schema/结构失败时会自动发起 repair prompt。
- `codex-runner`、`codex-bridge`、`server/app` 与前端导入 client/store 现在会透传原始错误文本到前端。
- 前端预览改为基于 `previewNodes` 在本地重建树形结构。
- 更新并重写相关测试，验证新协议、自动重试、错误透传和预览应用链路。

## 问题原因
- 旧的导入响应 schema 含有递归 `children` 结构，容易触发 Codex CLI 的 structured output/schema 兼容问题。
- 旧 runner 会把 CLI 失败压缩成泛化的 `request_failed`，前端看不到真实 stderr。
- 旧实现用 `raw_preserved` 伪成功结果掩盖了 Codex 实际执行失败的问题。

## 尝试的解决办法
1. 核对导入接口、bridge、runner 与前端 store 的旧实现，定位递归 schema 和错误吞没点。
2. 修改共享协议：引入 `TextImportPreviewItem`，将 `TextImportResponse.previewTree` 改为 `previewNodes`，并移除 `fallbackMode`。
3. 在 `server/codex-bridge.ts` 中改写导入 schema，补齐 `additionalProperties: false` 与完整 `required`，并移除递归 children。
4. 在 `server/codex-bridge.ts` 中删除 `raw_preserved` fallback，改成首轮失败后自动 repair 重试一次。
5. 在 `server/codex-runner.ts`、`server/app.ts` 中保留并透传 `rawMessage`。
6. 在前端 `text-import-client/store/dialog` 中改为显示原始错误，并基于扁平节点本地构树。
7. 重写并运行 `server/codex-bridge.test.ts`、`server/app.test.ts`、`src/features/import/text-import-store.test.ts`，随后执行 `pnpm test` 与 `pnpm build:web` 验证。

## 是否成功解决
- 状态：成功
- 说明：Codex 导入执行链路已按方案修正。导入预览不再依赖递归 schema，不再使用伪成功 fallback，失败时会透传原始错误，并在结构问题时自动重试一次。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\shared\ai-contract.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-runner.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts
- C:\Users\edwar\Desktop\BrainFlow\server\app.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.test.ts
- C:\Users\edwar\Desktop\BrainFlow\server\app.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-client.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-preview-tree.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.test.ts

## 遗留问题/下一步
- 这次修的是 Codex 执行链路，不是输入文本编码问题。如果上传文件本身读取后已经乱码，Codex 仍然可能无法正确整理内容，需要单独处理文件编码识别与解码。
- 工作区内仍有本任务之外的脏文件和未跟踪 `Work_Progress` 记录；后续提交时需要单独筛选范围。
