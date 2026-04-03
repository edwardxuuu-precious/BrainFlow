# 任务记录

## 任务名称
- 编辑器支持鼠标中键拖动画布

## 执行时间
- 开始时间：2026-04-03 10:30:00
- 结束时间：2026-04-03 10:40:00

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 在保留现有 `Space + 拖动画布` 交互不变的前提下，新增“按住鼠标滚轮拖动画布”的方式。

## 解决的问题
- 在编辑器画布中新增了“按住鼠标中键拖动画布”的交互入口。
- 保留了现有 `Space + 拖动画布` 行为，不改左键框选、多选和节点拖拽语义。
- 在画布容器上补了中键按下时的默认行为抑制，避免浏览器中键自动滚屏干扰画布平移。

## 问题原因
- 当前画布平移仅依赖键盘 `Space`，鼠标层面缺少与常见画布工具一致的中键拖动入口。
- 现有画布已经基于 `@xyflow/react`，但 `panOnDrag` 只接了布尔值，没有利用它对鼠标按键数组的原生支持。

## 尝试的解决办法
1. 确认 `@xyflow/react 12.10.2` 的 `panOnDrag` 支持 `number[]`，可直接指定鼠标中键作为平移按键。
2. 在 `MapEditorPage.tsx` 中将 `panOnDrag` 改为 `isSpacePressed ? true : [1]`，并显式声明 `panActivationKeyCode=\"Space\"`。
3. 在画布容器增加 `onMouseDownCapture`，对中键按下执行 `preventDefault()`，避免浏览器默认自动滚动。
4. 尝试补充 E2E 回归，但当前仓库里的 `src/test/e2e/brainflow.spec.ts` 存在历史编码与字符串字面量问题，本轮未继续扩面修复整份测试文件。

## 是否成功解决
- 状态：部分成功
- 说明：功能实现已完成，`pnpm lint` 与 `pnpm build` 通过；但现有 E2E 测试文件本身存在独立的编码/字符串问题，本轮未完成端到端回归修复。

## 相关文件
- src/pages/editor/MapEditorPage.tsx
- Work_Progress/2026-04-03/103000_middle_mouse_pan.md

## 遗留问题/下一步
- 如需正式补齐回归，需要先清理 `src/test/e2e/brainflow.spec.ts` 中现存的历史乱码与断裂字符串，再补中键拖动画布的端到端用例。
- 画布提示文案当前未同步更新为“Space 或鼠标滚轮拖动画布”；如需要完整文案一致性，可在下一轮单独清理该文件中的历史编码文本后一起调整。
