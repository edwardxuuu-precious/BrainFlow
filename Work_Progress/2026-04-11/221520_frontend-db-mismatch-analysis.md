# 任务记录

## 任务名称
- 分析前端脑图列表与数据库内容不一致

## 执行时间
- 开始时间：2026-04-11 22:15:20
- 结束时间：2026-04-11 22:20:30

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 解释为什么前端只显示测试1，但数据库中存在更多脑图记录，并确认其他记录是什么内容。

## 解决的问题
- 已确认前端首页并不是直接从 Postgres 读取脑图列表，而是优先使用 `localStorage` 中的 `brainflow:document-index:v1` 摘要索引。
- 已确认数据库中的 3 条 document 记录来自 2 个不同 workspace，不是同一个工作区下的 3 张脑图。
- 已确认另外两条“未命名脑图”是真实内容，不是脏数据：一张是 3 个主题的默认脑图，另一张是 4 个主题的默认脑图。
- 已确认当前 `http://127.0.0.1:4173` 这份浏览器存储里，`document-index` 和 `documents_cache` 都是两张“未命名脑图”；而你截图里显示“测试1”，说明你看到的是另一份本地浏览器存储上下文。

## 问题原因
- 首页列表调用 `service.listDocuments()` 后，`DocumentRepository.listDocuments()` 会先读取 `localStorage` 索引；只要索引非空，就直接返回，不会回退到同步缓存或主库重建列表。
- 同步层用 `brainflow-cloud-workspace-id` 维护当前 workspace，历史上如果浏览器生成过不同的 workspaceId 并分别 bootstrap 到 Postgres，主库里就会同时存在多个 workspace。
- 因为 `localhost` 与 `127.0.0.1`、不同浏览器 profile、不同存储上下文彼此隔离，所以你截图里看到的“测试1”与我刚才检查到的 `127.0.0.1` 那份两张“未命名脑图”可以同时成立。

## 尝试的解决办法
1. 查询 Postgres `workspaces`、`sync_heads`，确认当前主库有两个 workspace：`workspace_local_jbf70mhv`（两张未命名脑图）与 `workspace_local_n9jska2t`（测试1）。
2. 检查首页调用链，确认 [document-repository.ts](/c:/Users/edwar/Desktop/BrainFlow/src/features/storage/services/document-repository.ts:28) 会优先返回 `localStorage` 索引，[HomePage.tsx](/c:/Users/edwar/Desktop/BrainFlow/src/pages/home/HomePage.tsx:724) 直接用这个结果渲染列表。
3. 用 Playwright 直接读取浏览器存储，确认 `127.0.0.1:4173` 当前的 `brainflow:document-index:v1` 是两张未命名脑图，而 `localhost:4173` 当前为空，说明浏览器存储上下文确实分叉。
4. 读取数据库里 3 条 document 的内容预览，确认另外两条并非空壳，而是默认脑图结构。

## 是否成功解决
- 状态：成功
- 说明：已经定位到“数据库多内容、前端只显示测试1”的根因，并确认另外两条 document 的具体内容来源。

## 相关文件
- c:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-11\221520_frontend-db-mismatch-analysis.md
- c:\Users\edwar\Desktop\BrainFlow\src\features\storage\services\document-repository.ts
- c:\Users\edwar\Desktop\BrainFlow\src\pages\home\HomePage.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\storage\sync\cloud-sync-orchestrator.ts

## 遗留问题/下一步
- 首页文档列表目前存在设计缺陷：索引非空时不会自动从同步缓存/主库校验，容易长期显示过期摘要。
- 如果要彻底消除这类错位，下一步应把首页列表改为以当前 workspace 的同步缓存/主库为准，并在 workspace 切换或 bootstrap 后强制重建 `brainflow:document-index:v1`。
