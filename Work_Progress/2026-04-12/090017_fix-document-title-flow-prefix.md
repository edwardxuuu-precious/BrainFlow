# 任务记录

## 任务名称
- 修复脑图标题被反复写入 FLOW 前缀并统一 50 字限制

## 执行时间
- 开始时间：2026-04-12 09:00:17
- 结束时间：2026-04-12 09:09:30

## 仓库根目录
- `C:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 修复编辑页错误把 `FLOW - ` 写入脑图标题本身的问题。
- 统一脑图标题规范化逻辑，确保标题最长 50 个字符。
- 对已有异常 `FLOW - FLOW - ...` 标题做懒修复，并补充回归测试。

## 解决的问题
- 修复编辑页把浏览器页签品牌前缀 `FLOW - ` 误写回脑图标题本身，导致每次进入编辑页后标题持续叠加。
- 新增统一标题规范化 helper，覆盖创建、首页重命名、编辑页重命名、保存标准化、复制、副本导入命名。
- 对已有异常 `FLOW - FLOW - ...` 标题实现懒修复：读取与列表重建时会先显示修复后的标题，后续保存会落盘。
- 统一脑图标题最大长度为 50 个字符，并保证副本标题总长度不超过 50。
- 补充标题 helper、文档服务、编辑页与首页的回归测试并通过。

## 问题原因
- 编辑页 `MapEditorPage` 在监听脑图标题变化时，错误执行了类似 `document.title = \`FLOW - ${document.title}\`` 的对象字段改写。
- 由于该脑图对象会被自动保存，品牌前缀被当成真实脑图标题写回存储，重复打开编辑页后会持续叠加成 `FLOW - FLOW - ...`。
- 标题长度限制此前只在部分 UI 输入框和创建工厂中存在，没有统一收口到所有保存/复制/导入链路。

## 尝试的解决办法
1. 新增 `src/features/documents/document-title.ts`，统一提供标题清洗、浏览器页签标题拼装、副本标题派生逻辑。
2. 将 `createMindMapDocument`、首页重命名、编辑页重命名、`normalizeDocument`、本地索引摘要、文档复制、备份导入副本命名接入统一 helper。
3. 将编辑页标题副作用改为只写 `window.document.title`，并保留原脑图对象标题不变。
4. 补充并执行以下测试：
5. `pnpm vitest run src/features/documents/document-title.test.ts src/features/documents/document-service.test.ts src/features/storage/services/workspace-storage-service.test.ts src/pages/editor/MapEditorPage.test.tsx`
6. `pnpm vitest run src/pages/home/HomePage.test.tsx`

## 是否成功解决
- 状态：成功
- 说明：核心 bug 已修复，标题规范化与 50 字限制已统一落到主要读写链路，相关回归测试全部通过。

## 相关文件
- `src/pages/editor/MapEditorPage.tsx`
- `src/pages/home/HomePage.tsx`
- `src/features/documents/document-factory.ts`
- `src/features/documents/document-title.ts`
- `src/features/documents/document-title.test.ts`
- `src/features/documents/document-service.test.ts`
- `src/features/storage/services/document-repository.ts`
- `src/features/storage/adapters/indexeddb/legacy-document-local-service.ts`
- `src/features/storage/adapters/indexeddb/local-index-adapter.ts`
- `src/features/storage/services/workspace-storage-service.ts`
- `src/features/storage/services/workspace-storage-service.test.ts`
- `src/pages/editor/MapEditorPage.test.tsx`
- `src/pages/home/HomePage.test.tsx`

## 遗留问题/下一步
- `tree-operations.ts` 中的 `renameDocumentTitle` 仍保留原有 fallback 文本逻辑，但当前真实入口已在 UI 层和保存层统一规范化；如后续要彻底消除重复逻辑，可单独继续收口。
