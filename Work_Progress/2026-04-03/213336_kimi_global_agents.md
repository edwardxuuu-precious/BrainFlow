# 任务记录

## 任务名称
- 评估 Kimi 是否可实现全局 agents 规则与任务记录

## 执行时间
- 开始时间：2026-04-03 21:33:36
- 结束时间：2026-04-03 21:39:20

## 仓库根目录
- C:/Users/edwar/Desktop/BrainFlow

## 任务目标
- 判断 Kimi 是否支持类似 Codex 的全局 `AGENTS.md` 机制。
- 给出可落地方案，让 Kimi 在每次任务后记录本次做了什么。

## 解决的问题
- 已确认 `Kimi Code CLI` 原生支持项目级 `AGENTS.md`，可通过 `/init` 生成。
- 已确认官方文档提供全局 `skills` 目录与 `hooks` 机制，可用于模拟“全局规则 + 自动校验”。
- 已确认官方文档未明确声明存在用户级“全局 `AGENTS.md` 搜索路径”；更可行的做法是用全局 skill 或自定义 agent file 替代。
- 已确认会话数据保存在 `~/.kimi/sessions/.../context.jsonl`，可作为自动生成任务记录的原始数据来源。

## 问题原因
- 用户希望把 Codex 的项目级约束和任务留痕能力迁移到 Kimi，但两者的运行机制不同。
- Kimi 的官方能力拆分为项目 `AGENTS.md`、全局 skills、hooks、session 数据，而不是直接提供 Codex 式的全局 `AGENTS.md`。

## 尝试的解决办法
1. 先确认当前仓库根目录并按仓库规则建立任务记录。
2. 查询 Kimi 官方文档中关于 `AGENTS.md`、skills、hooks、session/export 的能力边界。
3. 基于官方能力给出两层方案。
4. 方案一：用全局 `SKILL.md` + 自定义 agent file 实现“全局 agents 规则”。
5. 方案二：用 `UserPromptSubmit` / `Stop` hooks + 会话数据解析脚本实现“每次任务后记录做了什么”。

## 是否成功解决
- 状态：成功
- 说明：已给出结论与可落地实现路径。结论是 Kimi 没有明确文档化的“全局 `AGENTS.md`”，但 `Kimi Code CLI` 可以通过全局 skill、自定义 agent file、hooks、session 数据实现近似甚至更强的效果；若是网页版或普通聊天版 Kimi，则基本无法做到同等级自动化。

## 相关文件
- Work_Progress/2026-04-03/213336_kimi_global_agents.md
- https://moonshotai.github.io/kimi-cli/zh/guides/getting-started.html
- https://moonshotai.github.io/kimi-cli/zh/customization/agents.html
- https://moonshotai.github.io/kimi-cli/en/customization/skills.html
- https://moonshotai.github.io/kimi-cli/zh/customization/hooks.html
- https://moonshotai.github.io/kimi-cli/zh/configuration/data-locations.html

## 遗留问题/下一步
- 如果你需要，我可以继续直接产出一套可用文件：
- `~/.kimi/skills/worklog/SKILL.md`
- `~/.kimi/agents/worklog-agent.yaml`
- `~/.kimi/agents/worklog-system.md`
- `~/.kimi/hooks/start-worklog.ps1`
- `~/.kimi/hooks/check-worklog.ps1`
- 并按 `Work_Progress/YYYY-MM-DD/HHMMSS_task.md` 规范写成可直接落地的脚本。
