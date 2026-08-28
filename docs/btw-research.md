# 调研：Claude Code `/btw` 与 dsh-selection-toolbar 的侧问能力评估

> 调研日期：2026-03 · 结论：**值得做**，推荐「一次性直连模型调用」路径，v1 范围见文末。

## 一、`/btw` 是什么

官方定义（[Interactive mode — Side questions with /btw](https://code.claude.com/docs/en/interactive-mode)）：

> Use /btw to ask a question about your current work **without adding to the conversation history**.

即：任务进行中的**旁路提问**（side question）——问关于当前工作的事，但完全不进入主对话。

### 核心语义（官方文档逐条）

| # | 语义 | 官方描述 |
| --- | --- | --- |
| 1 | 答案只来自已有上下文 | 从「你的消息 + Claude 的回复 + 已收集的工具结果」里作答：已读过的代码、早前的决策、会话里的任何内容 |
| 2 | **永不进入对话历史** | `/context` 里看不到；终端里是可关闭的浮层（overlay），线程只存内存，退出即消失；按 `x` 可清空 |
| 3 | **任务执行中可用** | Claude 正在回复时也能 `/btw`；旁路提问独立运行，不打断主回合；能看到目前为止的一切（除了还在生成中的回复） |
| 4 | **无工具访问** | 回答侧问时不能读文件、跑命令、搜索——只能用上下文里已有的东西 |
| 5 | 单轮回复 | 浮层内没有追问；想继续就再发一次 `/btw`；按 `f` 可把这条问答 fork 成后台子代理（带完整工具）继续深挖 |
| 6 | 侧问记忆 | 后面的侧问能看到之前的侧问：每次携带**最近 20 条**侧问往返（可清空）；最近 5 条灰显在答案上方 |
| 7 | 低成本 | 会话 prompt cache 还热的时候，一次侧问的成本 ≈ 答案本身 |
| 8 | 浮层键位 | Space/Enter/Esc 关闭 · ↑↓ 滚动 · ←→ 在历次侧问间切换 · `c` 复制原始 markdown · `f` fork 成子代理 · `x` 清空历史 |
| 9 | 空参数重开 | `/btw` 不带问题 = 重新打开浮层，定位到最近一次问答 |

设计哲学（官方原话）：**`/btw` 是子代理的逆操作**——侧问看得见全部对话但没有工具；子代理有全部工具但上下文从零开始。「Claude 已经知道的 → 问 /btw；要新查的 → 派子代理。」

### 何时用（社区实测，[DevelopersIO](https://dev.classmethod.jp/articles/claude-code-btw-instructions/)）

- 「刚才那个配置文件叫什么来着？」——名字/路径确认
- 长任务进行中：「这个函数是干嘛的？」——代码含义确认
- 「刚才为什么选这个方案？」——回顾早前决策
- 「XX 术语是什么意思？」——不打断工作查概念

共同点：**问的是「会话里已经出现过」的信息**，纯只读确认。要查新东西、要动文件，`/btw` 不适用（它会给「上下文里没有」的回答）。

### 与相邻命令的分工

| 手法 | 操作 | 问答保留 | 工具 | 打断主线 | 适用 |
| --- | --- | --- | --- | --- | --- |
| `/btw` | `/btw 问题` 一条命令 | 不保留（ephemeral） | ✗ | 不打断 | 轻量确认（名字/术语/旧决策） |
| `/rewind` | 提问→回答→Esc×2 回退 | 留在转录里 | ✓ | 打断 | 较重的问题，答完想回退 |
| `/fork` | 另开会话 | 独立会话保留 | ✓ | 不打断 | 重调查、想留档的独立话题 |
| 子代理 | Claude 自动派发 | 任务结果保留 | 全部 | 并行 | 调研获取新信息 |

## 二、结合本插件的评估

### 现状

`dsh-selection-toolbar` 的所有 AI 动作走 client `sessions.binding(id).session.prompt(...)`——**必然写进当前会话**。DSH 目前不存在任何「不落会话」的提问通道，划词杂问（翻译/解释/总结）几轮下来会稀释主任务上下文。

### DSH 侧三条实现路径

| 路径 | 机制 | 与 `/btw` 语义的吻合度 | 问题 |
| --- | --- | --- | --- |
| **A. 一次性直连模型调用（推荐）** | host 半端加 package-private RPC：读 `sessionQuery.readSession()` 取会话日志 → 序列化最近转录（带 token 预算截断）→ `llm.stream()` 一次性调用 → 答案回 client 渲染进临时浮层 | ★★★★★ 全程无会话、无历史、无工具；ephemeral 由构造保证 | 每次侧问重发上下文（需预算截断）；转录序列化要做干净；流式回传 v1 可先整段返回 |
| B. `sessions.fork` | fork 出真实分支会话再 prompt | ★★ 继承上下文，但 fork 是**真实会话**：进侧栏、落盘、不 ephemeral | 这是 `/fork` 的对应物，不是 `/btw`；事后 archive 也重 |
| C. `subagents.startContinuable` | 派子代理 | ☆ 方向反了 | 有工具、无上下文——是「去查新东西」，恰好是 `/btw` 的逆操作 |

路径 A 的其余缺口（均可解）：

- **成本**：Claude Code 靠 warm prompt cache 把侧问压到「答案本身的成本」；DSH 的 llm 适配层缓存行为未知 → v1 用预算截断（如最近 ~20 条消息或 ~8k tokens，与官方 20 条侧问记忆规则同构）。
- **模型选择**：host 侧 `agentDefaultModel.currentSelection()` + `llm.resolveCallConfig()` 可解析当前默认模型。
- **流式**：`llm.stream()` 返回 `AsyncIterable<StreamChunk>`，而 package RPC 是 JSON——v1 等完整答案再返回（延迟可接受），v2 经 host→client 事件推流。
- **「回答只能基于上下文」**：system prompt 里明确约束 + 不注册任何工具即可，天然无工具。

### 结论：值得做

1. **需求真实**：三个已确认痛点（杂问不污染主线 / 任务中插问 / 即用即弃）正是 `/btw` 的设计目标，且 DSH 现状是空白——所有 prompt 通路都写会话。
2. **架构契合**：插件已有 host 半端（注册设置命名空间），加一个 package-private RPC 是小步；`shell.overlay` 浮层经验现成；`ACTION_DEFS` + 逐动作开关的设置模式可平滑扩展「去向」配置。
3. **与现有价值主张互补**：现有动作 =「带着完整上下文进主线」；顺便问 =「问完即走不进主线」——两者在设置里共存，README 的核心卖点不受影响（默认行为不变）。
4. **生态差异化**：DSH 插件生态里第一个 side-question 通道。

### 需要正视的风险

- **成本可控性**：侧问按「答案一次 + 上下文一次」计费，长会话下不做截断会很贵；截断又可能丢掉问题涉及的早期内容 → 预算策略要在 v1 里做成明确的取舍（默认最近 N 条，可配）。
- **实现面是插件至今最大的一次**：host RPC + 会话日志读取 + 转录序列化 + 新浮层 UI + 去向设置，改动范围明显大于此前任何一个功能。
- **语义预期管理**：无工具意味着「问上下文里没有的」会得到「没有」的回答——这是 `/btw` 的特性不是 bug，UI 文案要讲清楚。

## 三、v1 范围建议

做：

1. 工具栏新增「顺便问」动作：选中文本 + 内联输入问题 → 侧问通道（路径 A）
2. 答案临时浮层：Esc / 点击外部关闭；`c` 复制 markdown；最近几条侧问灰显可回看（存 localStorage，可一键清空）——web 化复刻 `/btw` 键位精神
3. 设置卡新增「去向」：每个 AI 动作可选「进主线（默认，现行为）/ 走侧问」

不做（v1 明确排除）：

- 工具访问——无工具是 `/btw` 的核心特性
- 浮层内追问——想继续就再问一次（新侧问）
- fork 成子代理——v2 可用 `subagents` 服务补上 `f` 键的等价物
- composer 侧的 `/btw` 命令——host 侧 `commands` 注册表理论上支持，留作独立议题

## 参考来源

- 官方文档：[Interactive mode — Side questions with /btw](https://code.claude.com/docs/en/interactive-mode)（语义、键位、限制的权威来源）
- 实测与命令分工：[DevelopersIO — Claude Codeのbtwコマンドを使ってみたら](https://dev.classmethod.jp/articles/claude-code-btw-instructions/)
- 中文报道：[腾讯云开发者社区 — Claude Code 杀手级新功能 /btw 上线](https://cloud.tencent.com.cn/developer/article/2701688)
