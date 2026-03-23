# 语义中心固定验证流程

## 目标
语义中心改动不再只依赖 `tsc` 或 `pytest` 单侧通过，而是固定执行：

1. 后端回归
2. 前端类型检查
3. 前端构建
4. 浏览器关键路径烟测

## 服务就绪要求
执行浏览器烟测前，确保以下服务可用：

- 前端开发服务：`http://127.0.0.1:3000`
- 后端 API 与代理已刷新到最新代码

推荐顺序：

```bash
docker compose restart backend nginx
cd /path/to/cubic3-data-platform/frontend
npm run dev -- --host 127.0.0.1
```

## 固定验证入口

```bash
cd /path/to/cubic3-data-platform/frontend
DOMAIN_SMOKE_BASE_URL=http://127.0.0.1:3000 npm run verify:semantic
```

该命令会顺序执行：

1. `npm exec -- tsc --noEmit --pretty false`
2. `npm run build`
3. `npm run e2e:domain-smoke`
4. `npm run e2e:domain-publish-smoke`
5. `npm run e2e:cube-draft-smoke`

## 三条浏览器烟测

### 1. `domain-smoke`
- 创建领域草稿
- 跳转领域画布
- 校验 `draft` 状态

### 2. `domain-publish-smoke`
- 创建领域草稿
- 从 `Cube 库` 拖入至少一个 Cube
- 发布领域 YAML
- 校验状态变为 `active`

### 3. `cube-draft-smoke`
- 打开 `Cube Studio`
- 从物理表结构中选择表
- 生成 Cube 草稿
- 保存为 Draft Cube

## 说明
- 浏览器烟测使用 `playwright-cli`
- 烟测失败时会在 `frontend/tests/artifacts/` 下输出截图
- 当前固定验证流程只覆盖语义中心主路径，不替代完整回归测试体系
