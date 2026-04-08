# 任务记录

## 任务名称
- 排查本地保存逻辑与自动保存间隔

## 执行时间
- 开始时间：2026-04-08 17:18:37
- 结束时间：2026-04-08 17:27:31

## 仓库根目录
- C:\Users\Administrator\Desktop\BrainFlow

## 任务目标
- 确认当前本地保存逻辑、如何校验本地已正确保存，以及当前自动保存间隔是否适合调整到120秒。

## 解决的问题
- 确认编辑器本地保存采用编辑后320ms防抖触发，而不是120秒或分钟级轮询。
- 确认本地保存会同时写入云同步缓存IndexedDB、旧本地文档IndexedDB和本地索引localStorage。
- 确认30秒定时器属于云同步轮询，不属于本地自动保存。
- 整理出基于界面、刷新回读和浏览器存储的三层校验方式。

## 问题原因
- 界面同时展示“本地已保存”和“云端已同步”，容易把本地落盘节奏与云同步轮询节奏混淆；代码中这两条链路分开实现。

## 尝试的解决办法
1. 检索MapEditorPage、document-repository、cloud-sync-orchestrator等保存入口并串联调用链。
2. 核对SaveIndicator和设置页状态展示，确认时间戳来源于localStorage中的本地保存/云同步键。
3. 追踪IndexedDB与localStorage键名，明确应检查brainflow-sync-v2、brainflow-documents-v1和brainflow:document-index:v1。
4. 尝试用Playwright做运行态校验，但本机Playwright浏览器会话被占用，未继续强行接管。

## 是否成功解决
- 状态：成功
- 说明：已明确当前保存逻辑与间隔，并给出验证本地保存是否正确落盘的具体检查路径；尚未实施任何间隔调整。

## 相关文件
- src/pages/editor/MapEditorPage.tsx
- src/features/storage/services/document-repository.ts
- src/features/storage/sync/cloud-sync-orchestrator.ts
- src/features/storage/adapters/indexeddb/legacy-document-local-service.ts
- src/features/storage/adapters/indexeddb/local-index-adapter.ts
- src/features/storage/local/cloud-sync-idb.ts
- src/components/SaveIndicator.tsx
- src/features/storage/ui/StorageSettingsPage.tsx

## 遗留问题/下一步
- 如果要把120秒用于降低网络频率，应优先考虑调整云同步轮询而不是本地自动保存。
- 如果要增强“已正确保存”的可见性，可后续增加保存成功/失败提示或展示最近保存文档版本信息。