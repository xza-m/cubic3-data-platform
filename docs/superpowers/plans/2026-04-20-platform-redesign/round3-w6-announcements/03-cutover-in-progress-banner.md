<!-- docs/superpowers/plans/2026-04-20-platform-redesign/round3-w6-announcements/03-cutover-in-progress-banner.md -->

# 切换中 · 顶部 banner

> 受众：维护窗口期间仍尝试访问平台的用户。
> 投放：登录页 + 平台顶部条；切换完成后由 deploy.sh post-check 触发撤销。
> 语气：极简，单句中英文双语；含 ETA 占位。
> 字数预算：≤ 60 字（中）+ ≤ 25 词（英）。

---

## 中文版

**【系统升级中】平台正在焕新升级，预计 <ETA_HHMM> 完成；如已登录请保存工作并稍候。**

## English

**Platform upgrade in progress — back online by ~<ETA_HHMM>. Please save your work and check back soon.**

---

## 注

- `<ETA_HHMM>` 由 OnCall 在切换开始时填入（建议格式 `22:30`）。
- 切换完成、deploy.sh 退 0 后，由 OnCall 在前端 banner 配置中"撤销"该条；
  撤销后立即投放 `04-post-cutover-whats-new.md` 公告。
