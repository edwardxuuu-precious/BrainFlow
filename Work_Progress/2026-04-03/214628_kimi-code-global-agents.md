# 任务记录

## 任务名称
- 在 VS Code 中为 Kimi Code 设计全局 agents 规则与任务记录方案

## 执行时间
- 开始时间：2026-04-03 21:46:28
- 结束时间：2026-04-03 21:53:40

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 调研 Kimi Code 在 VS Code 中是否支持类似 Codex 的全局 `AGENTS.md` / 持久指令能力。
- 给出一个可执行方案，使其尽量接近 Codex 的“每次任务自动记录过程与结果”的工作流。

## 解决的问题
- 已确认 Kimi Code CLI 支持自定义 `agent-file`、系统提示词模板、`AGENTS.md` 注入、Hooks、用户级 Skills。
- 已确认 Kimi Code for VS Code 官方文档只暴露 `kimi.executablePath` 与 `kimi.environmentVariables` 等设置，未见直接配置 `--agent-file` 的独立开关。
- 已整理出一套可行方案：通过“自定义 Agent + VS Code 包装启动脚本 + Hooks 自动记账/校验”来模拟 Codex 的全局 `AGENTS.md` 与任务记录流程。

## 问题原因
- 用户希望把 Codex 当前这套“全局规则 + 每次任务记录”迁移到 VS Code 里的 Kimi Code，但该能力是否原生支持需要先确认。
- Kimi 原生更偏向“项目级 `AGENTS.md` + 自定义 Agent/Hook/Skill 组合”，并不像 Codex 这样天然围绕仓库内 `AGENTS.md` 和任务记录工作流展开。

## 尝试的解决办法
1. 按项目规则创建 `Work_Progress/2026-04-03` 与本 task 文件。
2. 核对 Kimi Code for VS Code 文档，确认扩展支持自定义 CLI 路径、环境变量、文件变更追踪、历史会话与 MCP。
3. 核对 Kimi Code CLI 文档，确认支持 `--agent-file`、系统提示词模板、`${KIMI_AGENTS_MD}`、用户级 Skills、`~/.kimi/config.toml`、Hooks 以及会话数据目录。
4. 基于上述能力设计替代方案：
5. 用自定义 Agent 承载“全局规则”。
6. 用 VS Code 的 `kimi.executablePath` 指向包装脚本，间接为每次会话附带 `--agent-file`。
7. 用 Hooks 在 `UserPromptSubmit` / `PostToolUse` / `Stop` / `SessionEnd` 时自动创建和补写 `Work_Progress/YYYY-MM-DD/*.md`。
8. 进阶做法是在 `Stop` Hook 中校验 task 文件是否完整，未完成则拒绝结束当前轮次并提醒模型补写，模拟 Codex 的强约束。

## 是否成功解决
- 状态：成功
- 说明：已给出基于 Kimi 官方能力边界的可落地实现路径。若用户需要，可继续直接生成 `global-agent.yaml`、`system.md`、Hook 脚本与 VS Code 设置样例。

## 相关文件
- `c:\Users\edwar\Desktop\BrainFlow\AGENTS.md`
- `c:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-03\214628_kimi-code-global-agents.md`
- 官方参考：
- `https://www.kimi.com/code/docs/kimi-code-for-vscode/guides/getting-started.html`
- `https://moonshotai.github.io/kimi-cli/zh/customization/agents.html`
- `https://moonshotai.github.io/kimi-cli/zh/customization/hooks.html`
- `https://moonshotai.github.io/kimi-cli/zh/customization/skills.html`
- `https://moonshotai.github.io/kimi-cli/zh/reference/kimi-command.html`
- `https://moonshotai.github.io/kimi-cli/en/configuration/data-locations.html`

## 遗留问题/下一步
- 若用户确认要落地，可直接在其 Windows 环境中生成以下文件：
- `~/.kimi/agents/global-agent.yaml`
- `~/.kimi/agents/system.md`
- `~/.kimi/agents/global-agents.md`
- `~/.kimi/hooks/task-log.ps1`
- `~/.kimi/config.toml` 中的 `[[hooks]]` 配置
- VS Code `settings.json` 中的 `kimi.executablePath`
