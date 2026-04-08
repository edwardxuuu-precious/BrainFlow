# 任务记录

## 任务名称
- 分析项目数据保存方式

## 执行时间
- 开始时间：2026-04-08 09:24:38
- 结束时间：2026-04-08 09:26:56

## 仓库根目录
- C:\Users\Administrator\Desktop\BrainFlow

## 任务目标
- 说明当前项目的数据如何保存，包括存储位置、存储介质和主要读写流程。

## 解决的问题
- 确认脑图文档主数据保存在浏览器 IndexedDB。
- 确认文档索引和最近打开文档保存在 localStorage。
- 确认 AI 会话保存在单独的 IndexedDB 数据库。
- 确认服务端仅把 AI 设置写入本机 JSON 文件，不保存脑图正文。
- 确认编辑器采用 320ms 防抖自动保存。

## 问题原因
- 项目采用本地优先架构，脑图正文和会话数据主要落在浏览器侧；同时 AI 设置需要跨前端会话保留，因此单独写入服务端本机文件。

## 尝试的解决办法
1. 检查 package.json、README 与首页文案，确认存储声明。
2. 阅读 src/features/documents/document-service.ts，定位文档持久化实现。
3. 阅读 src/features/ai/ai-storage.ts 与 src/features/ai/ai-store.ts，定位 AI 会话持久化实现。
4. 阅读 src/pages/editor/MapEditorPage.tsx 与 src/features/editor/editor-store.ts，确认自动保存和工作区状态保存方式。
5. 阅读 server/system-prompt.ts、server/app.ts、src/features/ai/ai-client.ts，确认服务端仅保存 AI 设置。

## 是否成功解决
- 状态：成功
- 说明：已完成代码级确认，能够说明数据的保存位置、触发时机和边界。

## 相关文件
- C:\Users\Administrator\Desktop\BrainFlow\src\features\documents\document-service.ts
- C:\Users\Administrator\Desktop\BrainFlow\src\features\documents\types.ts
- C:\Users\Administrator\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx
- C:\Users\Administrator\Desktop\BrainFlow\src\features\editor\editor-store.ts
- C:\Users\Administrator\Desktop\BrainFlow\src\features\ai\ai-storage.ts
- C:\Users\Administrator\Desktop\BrainFlow\src\features\ai\ai-store.ts
- C:\Users\Administrator\Desktop\BrainFlow\server\system-prompt.ts
- C:\Users\Administrator\Desktop\BrainFlow\server\app.ts
- C:\Users\Administrator\Desktop\BrainFlow\src\features\ai\ai-client.ts
- C:\Users\Administrator\Desktop\BrainFlow\README.md

## 遗留问题/下一步
- 如果需要迁移到云端，可先把 documentService 抽象为本地/远端双实现。
- 如果需要跨设备同步，优先设计文档主数据、会话数据、设置数据三类表或接口。
