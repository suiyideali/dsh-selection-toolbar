# dsh-selection-toolbar 收录 PR 流程（awesome-dsh-plugin）

> **当前状态（2026-08-20）**：✅ **已完成**。
> PR: https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/1909（**MERGED**
> 2026-08-19T14:35:26Z，merge commit `5cade19677c92a8f05d8dc269da891907e22e77a`）
> Submission gate ✅ · check（lint + README 重生成）✅ · 维护者 review ✅
> 徽章已验证：`curl -s https://awesome-dsh-plugin.com | grep -io selection-toolbar` 命中，
> 列表第 176 项 `suiyideali/dsh-selection-toolbar`，含安装命令展示。
> 前置条件全部满足：仓库创建满 1 天（`created_at` 2026-08-18T07:18:41Z，实测 1.0004 天 ≥ 1）·
> `dsh.bundle` manifest ✅ · 提交数 22 ≥ 10 ✅ · `dsh-plugin` topic ✅ · 非占位仓库 ✅。

## 步骤（1–9 全部完成）

> 涉及 fork / git push / 开 PR，执行前需再次征得用户同意（AGENTS.md 危险操作纪律）。

1. **Fork 上游**（在用户 GitHub 账号下）✅ 已完成
   ```sh
   gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone=false
   ```

2. **Clone fork 到临时目录**（不污染本工作区）✅ 已完成（/tmp/awesome-dsh-plugin，1501 条目）
   ```sh
   cd /tmp && rm -rf awesome-dsh-plugin && git clone https://github.com/suiyideali/awesome-dsh-plugin.git && cd awesome-dsh-plugin
   ```

3. **放置 YAML 文件** ✅ 已完成
   把 `scripts/pr-submission/suiyideali__dsh-selection-toolbar.yml` 复制为
   `data/plugins/suiyideali__dsh-selection-toolbar.yml`

4. **重新生成两个 README**（contributing.md 要求：README 由脚本生成，须一并提交）✅ 已完成
   ```sh
   npm ci        # 若 ~/.npm 权限报错，加 --cache /tmp/npm-cache-dsh
   node scripts/generate-readme.mjs
   ```

5. **核对生成的 README 差异**：确认列表中出现
   `[suiyideali/dsh-selection-toolbar]` 且分类正确（UI Enhancements，第 238 行）。✅ 已完成

6. **提交并推送**（需用户同意后执行）✅ 已完成（commit 6cab3011）
   ```sh
   git checkout -b add/dsh-selection-toolbar
   git add data/plugins/suiyideali__dsh-selection-toolbar.yml README.md README.zh.md
   git commit -m "Add suiyideali/dsh-selection-toolbar"
   git push -u origin add/dsh-selection-toolbar
   ```

7. **开 PR**（需用户同意后执行）✅ 已完成 → **PR #1909**
   ```sh
   gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin \
     --head suiyideali:add/dsh-selection-toolbar \
     --title "Add suiyideali/dsh-selection-toolbar" \
     --body "Floating selection toolbar (copy / quote / ask / explain / translate / summarize / custom). Declares dsh.bundle; category ui."
   ```

## 后续步骤（8–9 已完成）

8. **等待维护者合并 PR #1909** ✅ 已完成 —— 维护者于 2026-08-19T14:35:26Z 合并。
9. **合并后验证徽章** ✅ 已完成 —— `curl -s https://awesome-dsh-plugin.com | grep -io selection-toolbar`
   命中，站点列表第 176 项为 `suiyideali/dsh-selection-toolbar`（含 `dsh plugin --profile web add
   github:suiyideali/dsh-selection-toolbar` 安装命令展示）。
   - 看板徽章验证任务（taskId `9b22741e-df91-4619-bd18-c2f5513d1033`，cron `0 9 * * *`）原已暂停，
     本次手动验证即为等效确认；看板任务可标记完成或删除，也可保留为历史记录。

## 描述准确性自查（评审会对照源码）

- 复制 / 引用 / 询问 / 解释 / 翻译 / 总结 / 自定义 —— 与 README Features 表一致 ✅
- 选中文本 → 浮动工具栏 → 会话内操作 —— 与 README 描述一致 ✅
- 无营销词（no superlatives）✅
