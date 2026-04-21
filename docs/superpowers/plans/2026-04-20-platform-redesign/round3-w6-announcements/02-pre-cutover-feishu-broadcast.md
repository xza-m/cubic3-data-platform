<!-- docs/superpowers/plans/2026-04-20-platform-redesign/round3-w6-announcements/02-pre-cutover-feishu-broadcast.md -->

# 切换前 · 飞书群 + 邮件广播

> 受众：全体平台用户 + 业务对接人 + 数据团队 leader。
> 渠道：飞书群（业务支持群、数据交付群） + 邮件（all-hands data list）。
> 时机：T-72h 首发；T-24h 复发提醒。
> 字数预算：≤ 600 字。
> 语气：较正式，含背景与动机；末尾给出 OnCall 联系方式与 FAQ。

---

## 标题（飞书）

【平台升级预告】Cubic³ 数据平台焕新升级，<CUTOVER_DATE> <CUTOVER_TIME_WINDOW> 维护

## 标题（邮件）

[Action Required] Cubic³ 数据平台 <CUTOVER_DATE> 焕新升级与维护窗口通知

## 正文

各位同事：

经过 6 周的灰度迭代与三轮内部演练，Cubic³ 数据平台将正式切换到全新前端体验（v2 / Round 3 redesign）。本次升级合并了过去半年的可用性反馈与"语义优先"的工作流改造，主要价值如下：

- **统一的导航与信息架构**：数据中心、查询、语义、应用市场、配置中心五大模块按"工作流"重排；
- **更快的首屏与更稳的交互**：首屏 gzip ≤ 350 KB，关键页 a11y 0 严重违规；
- **可观测的故障**：错误上报与埋点接入完成，P0 / P1 故障可在 5 分钟内定位。

### 升级时间窗口

- 切换日：**<CUTOVER_DATE>**
- 维护窗口：**<CUTOVER_TIME_WINDOW>**（预计 30 分钟，预留 60 分钟 buffer）
- 期间影响：平台 UI 短暂不可访问；后端 API 滚动重启，**已有计划任务自动延后**。

### 用户行动建议

1. 维护窗口开始前 30 分钟保存所有未提交的查询 / 编辑；
2. 暂停手动触发的长跑作业，待切换完成后重启；
3. 切换完成后请使用 **Ctrl/Cmd + Shift + R** 强刷浏览器，加载新版资源；
4. 收藏栏旧路径会自动 301 到新路径，**6 个月内仍可访问**。

### 焕新一目了然

详见正式发布的 What's New 页面（切换完成后投放）。先放一张升级后的工作台预览：

`<SCREENSHOT_PLACEHOLDER_AFTER>`

### 已知差异与 FAQ

- 本体对象详情页暂未集成内联编辑（沿用列表 → 进入"新建"路径），W6+1 sprint 修复；
- 提取任务 Run 失败暂不支持页内重跑（走后端命令行），同上窗口修复；
- 完整列表与 FAQ：<FAQ_URL>

### OnCall 联系

- 飞书群：**<ONCALL_CHANNEL>**
- Tech Lead：<TECH_LEAD_CONTACT>
- PM：<PM_CONTACT>

如对升级时间或方案有疑问，请在 T-48h 前回复本帖或邮件，我们会一并答复。

— Cubic³ 平台团队
