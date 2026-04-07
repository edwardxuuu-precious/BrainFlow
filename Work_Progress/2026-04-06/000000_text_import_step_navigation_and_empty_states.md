# 任务记录

## 任务名称
- Markdown Import 三步页改为可随时切换，并补全空状态提示

## 执行时间
- 开始时间：2026-04-06 09:23:30
- 结束时间：2026-04-06 09:28:05

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 让 Import source、Structured preview、Merge review 三个步骤都可随时切换查看，并在没有结果时显示明确空状态提示。

## 解决的问题
- 去掉了 Structured preview / Merge review 的步骤门禁，三个步骤现在都可以点击切换查看。
- 在没有 preview 的情况下，第 2 步会显示“暂无结构化预览”空状态，第 3 步会显示“暂无 merge review 内容”空状态。
- 在 preview 生成中时，第 2 步和第 3 步会显示对应的生成中提示，而不是空白或不可点击。
- preview 已生成但没有 merge/conflict/warning 项时，第 3 步会显示“没有需要 review 的项”空状态。
- apply 过程中可以切换到其他步骤查看，切回第 3 步后仍能看到 apply 进度。

## 问题原因
- 当前三步页仍把第 2、3 步当作结果门禁；没有 preview 时用户无法切换进去查看，也缺少清晰的空状态层次。

## 尝试的解决办法
1. 检查当前 TextImportDialog 的步骤导航、自动跳步和空状态逻辑。
2. 将步骤导航从基于 preview readiness 的禁用逻辑改为始终可切换，当前步骤只做高亮不再禁用。
3. 为 Structured preview 与 Merge review 新增统一空状态卡片，区分 idle、generating、ready-no-items 三类状态。
4. 调整测试，覆盖无 preview 时切换查看、生成中提示、无 review 项提示，以及 apply 过程中跳出再返回的行为。
5. 执行 `pnpm vitest run src/features/import/components/TextImportDialog.test.tsx`、`pnpm exec tsc -p tsconfig.app.json --noEmit`、`pnpm build:web` 进行验证。

## 是否成功解决
- 状态：成功
- 说明：三步页已支持随时切换查看，空状态和生成中状态补齐，相关测试和前端构建通过。

## 相关文件
- src/features/import/components/TextImportDialog.tsx
- src/features/import/components/TextImportDialog.module.css
- src/features/import/components/TextImportDialog.test.tsx

## 遗留问题/下一步
- `MapEditorPage` 仍有既有的 chunk size warning，但本次改动未引入新的构建失败。
