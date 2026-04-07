# 任务记录

## 任务名称
- GTM 五文件导入基准与批量合图实现

## 执行时间
- 开始时间：2026-04-05 19:29:13
- 结束时间：2026-04-05 20:24:30

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 以 `C:\Users\edwar\Downloads` 下 5 个 `GTM*.md` 作为固定语料，扩展单文件与批量导入能力。
- 让批量导入可以在 30 秒内先生成完整结构脑图，并保留后台语义归并与并发安全。
- 建立可重复的 benchmark feedback loop，拿到真实 `p50/p95`、节点规模和语义建议统计。

## 解决的问题
- 新增了本地批量 Markdown 导入核心，支持单文件和多文件共用一套结构化预览逻辑。
- 导入弹窗支持多文件选择、批量进度、当前文件、跨文件语义建议和批量可应用状态。
- `apply` 阶段新增目标节点指纹校验，高置信度语义更新只会落到“预览后未被用户修改”的节点上。
- 基准脚本支持 `--file` 和 `--dir` 两种模式，能够对 5 个 GTM 文件逐个跑单文件 benchmark，并对整批目录跑总图 benchmark。
- 真实语料 benchmark 结果：
  - `GTM_main.md`：`p50=32ms`，`p95=52ms`
  - `GTM_step1.md`：`p50=23ms`，`p95=23ms`
  - `GTM_step1-1.md`：`p50=51ms`，`p95=54ms`
  - `GTM_step1-1-1.md`：`p50=404ms`，`p95=428ms`
  - `GTM_step1-1-1-1.md`：`p50=665ms`，`p95=832ms`
  - 五文件批量总图：`p50=6246ms`，`p95=6577ms`

## 问题原因
- 原实现只覆盖单文件本地 Markdown 热路径，多文件导入、批量基准、跨文件语义建议和批量 UI 状态都不存在。
- 原 `apply` 只对纯 `create_child` 做安全 rebase，一旦引入语义更新就会退回整文档版本校验，无法满足“后台期间不覆盖新编辑”。
- 批量 benchmark 以前只能看单文件，无法形成稳定的目录级 feedback loop。

## 尝试的解决办法
1. 重建 `local-text-import-core.ts`，加入：
   - 单文件结构保真导入
   - 批量导入容器树
   - 现有脑图语义候选匹配
   - 跨文件语义建议
   - GTM 文件层级排序
2. 改造 `text-import.worker.ts`、`text-import-job.ts`、`text-import-store.ts`：
   - 支持 `single` / `batch` 两种 job
   - 传回 `fileCount`、`completedFileCount`、`currentFileName`
   - 保留关闭弹窗后继续处理
3. 改造 `TextImportDialog.tsx` 和 `MapEditorPage.tsx`：
   - 文件多选
   - 批量状态展示
   - 批量可应用按钮文案
4. 扩展 `text-import-apply.ts`：
   - 为 `update_topic` 增加 `targetFingerprint` 校验
   - 目标节点被改动时自动跳过语义更新并返回 warning
5. 扩展 `scripts/benchmark-markdown-import.ts`：
   - 支持 `--dir`
   - 输出单文件语料汇总和批量总图汇总
6. 运行验证：
   - `pnpm vitest run src/features/import/local-text-import-core.test.ts src/features/import/text-import-apply.test.ts src/features/import/text-import-store.test.ts src/features/import/components/TextImportDialog.test.tsx`
   - `pnpm build:web`
   - `pnpm build:server`
   - `pnpm vitest run server/app.test.ts server/codex-bridge.test.ts`
   - `pnpm benchmark:markdown-import --file "C:\Users\edwar\Downloads\GTM_main.md" --runs 5`
   - `pnpm benchmark:markdown-import --dir "C:\Users\edwar\Downloads" --runs 5`

## 是否成功解决
- 状态：部分成功
- 说明：
  - 已完成单文件与批量导入、批量 benchmark、批量 UI、跨文件语义建议和并发安全 apply。
  - 当前“强语义自动归并”实现为本地候选裁决 + 高置信度自动 `update_topic` + 指纹保护。
  - 还没有单独新增一个真正的 Codex 候选裁决后台服务；因此这里的“强语义”不是新的服务端 AI pipeline，而是本地启发式语义归并。

## 相关文件
- `shared/ai-contract.ts`
- `src/features/import/local-text-import-core.ts`
- `src/features/import/text-import.worker.ts`
- `src/features/import/text-import-job.ts`
- `src/features/import/text-import-store.ts`
- `src/features/import/text-import-apply.ts`
- `src/features/import/components/TextImportDialog.tsx`
- `src/features/import/components/TextImportDialog.module.css`
- `src/pages/editor/MapEditorPage.tsx`
- `scripts/benchmark-markdown-import.ts`
- `src/features/import/*.test.ts*`

## 遗留问题/下一步
- 如果后续要把“强语义自动归并”进一步提升为真正的 AI 候选裁决，需要增加新的 server bridge 接口，而不是继续把全文导入塞回旧的 Codex 热路径。
- 批量 benchmark 已满足 30 秒目标，但当前语义归并热点主要在跨文件建议生成和 apply 阶段；如需继续提速，应优先优化这两段。
- 当前后台能力覆盖同一会话内关闭弹窗后继续处理，不包含浏览器刷新后的任务恢复。
