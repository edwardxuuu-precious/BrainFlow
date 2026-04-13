# 任务记录

## 任务名称
- 查询当前数据保存位置与脑图列表

## 执行时间
- 开始时间：2026-04-11 21:45:20
- 结束时间：2026-04-11 21:49:30

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 说明当前脑图数据的实际保存方式。
- 判断脑图目前保存在哪里。
- 尝试列出当前可见的脑图。

## 解决的问题
- 确认当前代码设计是“本机 Postgres 主库 + 浏览器 IndexedDB 缓存 + localStorage 索引”。
- 确认本机 Postgres 当前未在 127.0.0.1:5432 监听，因此无法从主库读取现有脑图。
- 通过浏览器 origin http://127.0.0.1:4173 直接读取 localStorage 与 IndexedDB，列出当前可见脑图列表。

## 问题原因
- 用户需要知道“设计上的保存位置”和“当前这台机器上实际还能读到的数据”是否一致。
- 当前数据库未启动，必须区分“目标架构”与“此刻真实可访问的数据层”。

## 尝试的解决办法
1. 检查代码中的存储实现、默认数据库配置以及本地监听端口。
2. 尝试直接连接本机 Postgres 读取 workspaces 与 sync_heads。
3. 在浏览器上下文里读取 rainflow:document-index:v1 与 rainflow-sync-v2，确认当前可见脑图。

## 是否成功解决
- 状态：成功
- 说明：已确认当前实现与当前实际数据位置，并读出浏览器侧可见脑图列表。

## 相关文件
- c:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-11\214520_current-storage-and-doc-list.md
- c:\Users\edwar\Desktop\BrainFlow\src\features\storage\services\document-repository.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\storage\local\cloud-sync-idb.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\storage\adapters\indexeddb\local-index-adapter.ts
- c:\Users\edwar\Desktop\BrainFlow\server\repos\postgres-sync-repository.ts

## 遗留问题/下一步
- 如果要把这 2 个脑图真正持久化到主库，需要先启动本机 Postgres，再让应用完成一次状态刷新或写入。
- 如果要进一步核对是否存在名为“测试”的脑图，需要在 Postgres 启动后再次查询主库，或在当前浏览器里打开这两个未命名脑图检查内容。
