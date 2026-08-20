# 看板定时任务配置（明天 8-19 提 PR）

> 创建入口：DSH Web 侧边栏「任务看板」→ 新建任务。字段按下面填写。
> 数据落盘：`~/.dsh/task-board/ledger-v2.json`（Host 权威账本）。

## 任务字段

| 字段 | 值 |
| --- | --- |
| 任务名 | 提交 dsh-selection-toolbar 收录 PR（明日） |
| 状态 | 定时（scheduled / enabled） |
| Cron（5 段，Host 时区 Asia/Shanghai） | `20 15 19 8 *`（8 月 19 日 15:20；仓库满 1 天时刻为 15:18:28，留 2 分钟余量） |
| 工作区 | `/Users/suiyideali/claude_sandbox/dsh-selection-toolbar` |
| Agent 预设 | 默认预设即可（或你常用的主预设） |
| 权限 | 见下方「权限与授权」一节 |

## 任务 Prompt（直接粘贴到任务正文）

```
按以下流程为 dsh-selection-toolbar 提交 awesome-dsh-plugin 收录 PR：

1. 读取工作区内 /Users/suiyideali/claude_sandbox/dsh-selection-toolbar/scripts/pr-submission/PR-STEPS.md，
   以及 YAML 草稿 scripts/pr-submission/suiyideali__dsh-selection-toolbar.yml。
2. 先确认仓库创建已满 1 天（首个提交 2026-08-18 15:18 +0800，CI 硬性检查）；
   若尚未满 1 天，说明原因并结束任务。
3. 按 PR-STEPS.md 步骤执行：fork 上游仓库 → clone 到 /tmp → 放入 YAML →
   npm ci && node scripts/generate-readme.mjs 重生成 README → 核对列表出现本插件 →
   git commit → push 到 fork → gh pr create 到 awesome-dsh-plugin/awesome-dsh-plugin。
4. 涉及 git push / 创建 PR 等危险操作：按 AGENTS.md 纪律先征得用户授权；
   无人应答则停在授权点，报告"等待用户授权"，不得擅自推送。
5. 全部完成或停住后，汇报：PR 链接（或卡住的授权点）、执行摘要。
```

## 权限与授权（重要）

- 看板「钉住权限」= 任务开始前执行 `/permission <id>`。**fail-closed**：权限命令被拒则任务
  在执行前失败，不会发送任务 prompt。
- 方案 A（全自动，需谨慎）：选一个允许危险操作自动放行的权限预设。任务将自动
  fork / push / 开 PR，全程无人值守。⚠️ 这相当于把 GitHub 写操作托付给定时 agent。
- 方案 B（推荐，符合 AGENTS.md）：选默认问询权限。任务自动完成 fork、clone、YAML、
  README 重生成与 commit，**停在 push 前**请求授权；你批准后它继续推送并开 PR。
  若无人应答，任务安全停在授权点（fail-closed），可手动补跑后续步骤。

## 注意事项

- 错过触发点不补跑：若 15:20 时 Host 关机/睡眠，本次触发被跳过，需手动运行任务。
- 若任务已运行中，下一次 cron 命中会跳过，不会重叠。
- 任务执行消耗 API 额度（会开一个独立 DSH agent 会话）。
- 执行记录可在看板任务详情中查看执行会话转写。
