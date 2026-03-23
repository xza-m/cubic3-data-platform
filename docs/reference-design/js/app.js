/**
 * CUBIC3 - Bauhaus Digital
 * 主 JavaScript 文件
 */

// ========================================
// 应用状态
// ========================================
const AppState = {
    currentPage: 'dashboard',
    expandedGroups: new Set()
};

// ========================================
// 页面映射
// ========================================
const PageMapping = {
    'dashboard': 'dashboard',
    'query': 'query',
    'data': 'data-source',
    'app': 'app-market',
    'config': 'config-channel',
    'ai': 'ai'
};

const ReverseMapping = {
    'dashboard': 'dashboard',
    'query': 'query',
    'data-source': 'data',
    'data-set': 'data',
    'app-market': 'app',
    'app-monitor': 'app',
    'config-channel': 'config',
    'config-sub': 'config',
    'ai': 'ai'
};

const GroupPages = {
    'data': ['data-source', 'data-set'],
    'app': ['app-market', 'app-monitor'],
    'config': ['config-channel', 'config-sub']
};

// ========================================
// 页面内容
// ========================================
const PageContent = {
    'dashboard': `
        <div class="page-header">
            <div class="page-breadcrumb">控制台</div>
            <h1 class="page-title">欢迎回来</h1>
            <p class="page-subtitle">这里是您的 CUBIC3 控制中心</p>
        </div>
        
        <div class="card-grid">
            <div class="stat-card">
                <div class="stat-label">APPS</div>
                <div class="stat-value">12</div>
                <div class="stat-desc">运行中应用</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">QUERIES</div>
                <div class="stat-value">28</div>
                <div class="stat-desc">今日查询</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">SYNC TASKS</div>
                <div class="stat-value">156</div>
                <div class="stat-desc">同步任务</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">USERS</div>
                <div class="stat-value">8</div>
                <div class="stat-desc">活跃用户</div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">
                <h2 class="section-title">快速操作</h2>
            </div>
            <div class="section-content">
                <div class="quick-actions">
                    <button class="action-btn">创建查询</button>
                    <button class="action-btn">添加数据源</button>
                    <button class="action-btn">创建应用</button>
                    <button class="action-btn">查看日志</button>
                </div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">
                <h2 class="section-title">最近活动</h2>
            </div>
            <div class="section-content">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>事件</th>
                            <th>时间</th>
                            <th>状态</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon red"></span>销售数据同步完成</div></td>
                            <td>2 分钟前</td>
                            <td><span class="status-badge success">成功</span></td>
                        </tr>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon blue"></span>数据查询执行</div></td>
                            <td>5 分钟前</td>
                            <td><span class="status-badge success">成功</span></td>
                        </tr>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon yellow"></span>应用部署</div></td>
                            <td>10 分钟前</td>
                            <td><span class="status-badge success">成功</span></td>
                        </tr>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon blue"></span>系统备份</div></td>
                            <td>1 小时前</td>
                            <td><span class="status-badge success">成功</span></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `,
    
    'query': `
        <div class="page-header">
            <div class="page-breadcrumb">查询中心</div>
            <h1 class="page-title">查询中心</h1>
            <p class="page-subtitle">创建和管理 SQL 查询，可视化数据分析</p>
        </div>
        
        <div class="btn-group" style="margin-bottom: 24px;">
            <button class="btn btn-primary">+ 新建查询</button>
            <button class="btn btn-secondary">查询模板</button>
            <button class="btn btn-secondary">执行历史</button>
        </div>
        
        <div class="section">
            <div class="section-header">
                <h2 class="section-title">查询模板</h2>
            </div>
            <div class="section-content">
                <div class="template-grid">
                    <div class="template-card">
                        <div class="template-name">销售数据查询</div>
                        <div class="template-desc">日常销售统计</div>
                    </div>
                    <div class="template-card">
                        <div class="template-name">用户行为分析</div>
                        <div class="template-desc">用户活跃度追踪</div>
                    </div>
                    <div class="template-card">
                        <div class="template-name">库存预警</div>
                        <div class="template-desc">低库存商品查询</div>
                    </div>
                    <div class="template-card">
                        <div class="template-name">财务报表</div>
                        <div class="template-desc">收支统计分析</div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">
                <h2 class="section-title">最近查询</h2>
            </div>
            <div class="section-content">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>查询名称</th>
                            <th>SQL</th>
                            <th>执行时间</th>
                            <th>状态</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon red"></span>今日销售统计</div></td>
                            <td><code class="code-text">SELECT * FROM sales WHERE date = '2026-01-26'</code></td>
                            <td>2 分钟前</td>
                            <td><span class="status-badge success">成功</span></td>
                        </tr>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon blue"></span>用户增长分析</div></td>
                            <td><code class="code-text">SELECT COUNT(*) FROM users GROUP BY date</code></td>
                            <td>15 分钟前</td>
                            <td><span class="status-badge success">成功</span></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `,
    
    'data-source': `
        <div class="page-header">
            <div class="page-breadcrumb">数据中心 > 数据源管理</div>
            <h1 class="page-title">数据源管理</h1>
            <p class="page-subtitle">管理和监控数据源连接状态</p>
        </div>
        
        <div class="card-grid">
            <div class="stat-card">
                <div class="stat-label">TOTAL</div>
                <div class="stat-value">12</div>
                <div class="stat-desc">数据源总数</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">CONNECTED</div>
                <div class="stat-value">10</div>
                <div class="stat-desc">已连接</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">TODAY SYNC</div>
                <div class="stat-value">86</div>
                <div class="stat-desc">今日同步</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">ISSUES</div>
                <div class="stat-value">2</div>
                <div class="stat-desc">需要处理</div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">
                <h2 class="section-title">数据源列表</h2>
                <button class="btn btn-primary">+ 添加数据源</button>
            </div>
            <div class="section-content">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>名称</th>
                            <th>类型</th>
                            <th>状态</th>
                            <th>最后同步</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon red"></span>MySQL-生产库</div></td>
                            <td>MySQL</td>
                            <td><span class="status-badge success">已连接</span></td>
                            <td>2 分钟前</td>
                            <td class="cell-actions">
                                <button class="btn btn-secondary btn-small">测试</button>
                                <button class="btn btn-secondary btn-small">编辑</button>
                            </td>
                        </tr>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon blue"></span>MongoDB-日志</div></td>
                            <td>MongoDB</td>
                            <td><span class="status-badge success">已连接</span></td>
                            <td>5 分钟前</td>
                            <td class="cell-actions">
                                <button class="btn btn-secondary btn-small">测试</button>
                                <button class="btn btn-secondary btn-small">编辑</button>
                            </td>
                        </tr>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon yellow"></span>PostgreSQL-数据仓库</div></td>
                            <td>PostgreSQL</td>
                            <td><span class="status-badge error">连接失败</span></td>
                            <td>1 小时前</td>
                            <td class="cell-actions">
                                <button class="btn btn-secondary btn-small">重试</button>
                                <button class="btn btn-secondary btn-small">编辑</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `,
    
    'data-set': `
        <div class="page-header">
            <div class="page-breadcrumb">数据中心 > 数据集管理</div>
            <h1 class="page-title">数据集管理</h1>
            <p class="page-subtitle">创建和管理数据集，支持多表关联</p>
        </div>
        
        <div class="card-grid">
            <div class="stat-card">
                <div class="stat-label">DATASETS</div>
                <div class="stat-value">24</div>
                <div class="stat-desc">数据集总数</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">ACTIVE</div>
                <div class="stat-value">18</div>
                <div class="stat-desc">活跃使用</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">FIELDS</div>
                <div class="stat-value">342</div>
                <div class="stat-desc">字段总数</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">UPDATED</div>
                <div class="stat-value">6</div>
                <div class="stat-desc">今日更新</div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">
                <h2 class="section-title">数据集列表</h2>
                <button class="btn btn-primary">+ 创建数据集</button>
            </div>
            <div class="section-content">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>名称</th>
                            <th>数据源</th>
                            <th>字段数</th>
                            <th>更新时间</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon red"></span>销售订单数据集</div></td>
                            <td>MySQL-生产库</td>
                            <td>28</td>
                            <td>10 分钟前</td>
                            <td class="cell-actions">
                                <button class="btn btn-secondary btn-small">查看</button>
                                <button class="btn btn-secondary btn-small">编辑</button>
                            </td>
                        </tr>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon blue"></span>用户行为数据集</div></td>
                            <td>MongoDB-日志</td>
                            <td>45</td>
                            <td>1 小时前</td>
                            <td class="cell-actions">
                                <button class="btn btn-secondary btn-small">查看</button>
                                <button class="btn btn-secondary btn-small">编辑</button>
                            </td>
                        </tr>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon yellow"></span>库存统计数据集</div></td>
                            <td>PostgreSQL-数据仓库</td>
                            <td>16</td>
                            <td>3 小时前</td>
                            <td class="cell-actions">
                                <button class="btn btn-secondary btn-small">查看</button>
                                <button class="btn btn-secondary btn-small">编辑</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `,
    
    'app-market': `
        <div class="page-header">
            <div class="page-breadcrumb">应用中心 > 应用市场</div>
            <h1 class="page-title">应用市场</h1>
            <p class="page-subtitle">浏览和安装数据应用，自动化您的工作流程</p>
        </div>
        
        <div class="filter-bar">
            <input type="text" class="filter-input" placeholder="搜索应用...">
            <select class="filter-select">
                <option>全部类型</option>
                <option>数据同步</option>
                <option>报表推送</option>
                <option>数据监控</option>
            </select>
        </div>
        
        <div class="app-grid">
            <div class="app-card">
                <div class="app-card-header">
                    <div class="app-name">销售报表推送</div>
                    <div class="app-type">报表推送</div>
                </div>
                <div class="app-card-body">
                    <div class="app-desc">每日自动生成销售报表并推送至飞书群</div>
                    <div class="app-meta">
                        <span>每日 9:00</span>
                        <span>运行中</span>
                    </div>
                </div>
                <div class="app-card-footer">
                    <button class="btn btn-secondary btn-small">配置</button>
                    <button class="btn btn-secondary btn-small">日志</button>
                </div>
            </div>
            
            <div class="app-card">
                <div class="app-card-header">
                    <div class="app-name">库存预警</div>
                    <div class="app-type">数据监控</div>
                </div>
                <div class="app-card-body">
                    <div class="app-desc">实时监控库存水平，低于阈值自动报警</div>
                    <div class="app-meta">
                        <span>实时监控</span>
                        <span>运行中</span>
                    </div>
                </div>
                <div class="app-card-footer">
                    <button class="btn btn-secondary btn-small">配置</button>
                    <button class="btn btn-secondary btn-small">日志</button>
                </div>
            </div>
            
            <div class="app-card">
                <div class="app-card-header">
                    <div class="app-name">数据同步任务</div>
                    <div class="app-type">数据同步</div>
                </div>
                <div class="app-card-body">
                    <div class="app-desc">定时同步多个数据源数据到数据仓库</div>
                    <div class="app-meta">
                        <span>每小时</span>
                        <span>运行中</span>
                    </div>
                </div>
                <div class="app-card-footer">
                    <button class="btn btn-secondary btn-small">配置</button>
                    <button class="btn btn-secondary btn-small">日志</button>
                </div>
            </div>
            
            <div class="app-card">
                <div class="app-card-header">
                    <div class="app-name">用户分析报告</div>
                    <div class="app-type">报表推送</div>
                </div>
                <div class="app-card-body">
                    <div class="app-desc">每周生成用户行为分析报告</div>
                    <div class="app-meta">
                        <span>每周一</span>
                        <span>已暂停</span>
                    </div>
                </div>
                <div class="app-card-footer">
                    <button class="btn btn-secondary btn-small">配置</button>
                    <button class="btn btn-secondary btn-small">启用</button>
                </div>
            </div>
        </div>
    `,
    
    'app-monitor': `
        <div class="page-header">
            <div class="page-breadcrumb">应用中心 > 执行监控</div>
            <h1 class="page-title">执行监控</h1>
            <p class="page-subtitle">监控应用执行状态和历史记录</p>
        </div>
        
        <div class="card-grid">
            <div class="stat-card">
                <div class="stat-label">TODAY RUNS</div>
                <div class="stat-value">156</div>
                <div class="stat-desc">今日执行</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">SUCCESS</div>
                <div class="stat-value">148</div>
                <div class="stat-desc">成功</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">FAILED</div>
                <div class="stat-value">8</div>
                <div class="stat-desc">失败</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">RUNNING</div>
                <div class="stat-value">3</div>
                <div class="stat-desc">执行中</div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">
                <h2 class="section-title">执行记录</h2>
            </div>
            <div class="section-content">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>应用名称</th>
                            <th>触发方式</th>
                            <th>开始时间</th>
                            <th>耗时</th>
                            <th>状态</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon red"></span>销售报表推送</div></td>
                            <td>定时触发</td>
                            <td>09:00:00</td>
                            <td>2.3s</td>
                            <td><span class="status-badge success">成功</span></td>
                            <td class="cell-actions">
                                <button class="btn btn-secondary btn-small">详情</button>
                            </td>
                        </tr>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon blue"></span>数据同步任务</div></td>
                            <td>定时触发</td>
                            <td>08:00:00</td>
                            <td>45.6s</td>
                            <td><span class="status-badge success">成功</span></td>
                            <td class="cell-actions">
                                <button class="btn btn-secondary btn-small">详情</button>
                            </td>
                        </tr>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon yellow"></span>库存预警</div></td>
                            <td>事件触发</td>
                            <td>07:32:15</td>
                            <td>0.8s</td>
                            <td><span class="status-badge error">失败</span></td>
                            <td class="cell-actions">
                                <button class="btn btn-secondary btn-small">详情</button>
                                <button class="btn btn-secondary btn-small">重试</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `,
    
    'config-channel': `
        <div class="page-header">
            <div class="page-breadcrumb">配置中心 > 渠道管理</div>
            <h1 class="page-title">渠道管理</h1>
            <p class="page-subtitle">管理消息推送渠道，支持飞书、钉钉、邮件等</p>
        </div>
        
        <div class="card-grid">
            <div class="stat-card">
                <div class="stat-label">CHANNELS</div>
                <div class="stat-value">6</div>
                <div class="stat-desc">渠道总数</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">ACTIVE</div>
                <div class="stat-value">5</div>
                <div class="stat-desc">已启用</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">TODAY SENT</div>
                <div class="stat-value">128</div>
                <div class="stat-desc">今日发送</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">SUCCESS RATE</div>
                <div class="stat-value">98%</div>
                <div class="stat-desc">发送成功率</div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">
                <h2 class="section-title">渠道列表</h2>
                <button class="btn btn-primary">+ 添加渠道</button>
            </div>
            <div class="section-content">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>渠道名称</th>
                            <th>类型</th>
                            <th>状态</th>
                            <th>今日发送</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon red"></span>飞书-数据团队群</div></td>
                            <td>飞书机器人</td>
                            <td><span class="status-badge success">已启用</span></td>
                            <td>45</td>
                            <td class="cell-actions">
                                <button class="btn btn-secondary btn-small">测试</button>
                                <button class="btn btn-secondary btn-small">编辑</button>
                            </td>
                        </tr>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon blue"></span>钉钉-运营群</div></td>
                            <td>钉钉机器人</td>
                            <td><span class="status-badge success">已启用</span></td>
                            <td>32</td>
                            <td class="cell-actions">
                                <button class="btn btn-secondary btn-small">测试</button>
                                <button class="btn btn-secondary btn-small">编辑</button>
                            </td>
                        </tr>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon yellow"></span>邮件-管理层</div></td>
                            <td>邮件</td>
                            <td><span class="status-badge warning">未配置</span></td>
                            <td>0</td>
                            <td class="cell-actions">
                                <button class="btn btn-secondary btn-small">配置</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `,
    
    'config-sub': `
        <div class="page-header">
            <div class="page-breadcrumb">配置中心 > 订阅管理</div>
            <h1 class="page-title">订阅管理</h1>
            <p class="page-subtitle">管理数据订阅规则，定制个性化推送</p>
        </div>
        
        <div class="card-grid">
            <div class="stat-card">
                <div class="stat-label">SUBSCRIPTIONS</div>
                <div class="stat-value">18</div>
                <div class="stat-desc">订阅总数</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">ACTIVE</div>
                <div class="stat-value">15</div>
                <div class="stat-desc">生效中</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">SUBSCRIBERS</div>
                <div class="stat-value">42</div>
                <div class="stat-desc">订阅用户</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">TRIGGERED</div>
                <div class="stat-value">86</div>
                <div class="stat-desc">今日触发</div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">
                <h2 class="section-title">订阅列表</h2>
                <button class="btn btn-primary">+ 创建订阅</button>
            </div>
            <div class="section-content">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>订阅名称</th>
                            <th>数据源</th>
                            <th>推送频率</th>
                            <th>订阅人数</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon red"></span>日销售报告</div></td>
                            <td>销售订单数据集</td>
                            <td>每日 09:00</td>
                            <td>12</td>
                            <td class="cell-actions">
                                <button class="btn btn-secondary btn-small">查看</button>
                                <button class="btn btn-secondary btn-small">编辑</button>
                            </td>
                        </tr>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon blue"></span>库存预警通知</div></td>
                            <td>库存统计数据集</td>
                            <td>实时</td>
                            <td>8</td>
                            <td class="cell-actions">
                                <button class="btn btn-secondary btn-small">查看</button>
                                <button class="btn btn-secondary btn-small">编辑</button>
                            </td>
                        </tr>
                        <tr>
                            <td><div class="cell-with-icon"><span class="cell-icon yellow"></span>周用户分析</div></td>
                            <td>用户行为数据集</td>
                            <td>每周一</td>
                            <td>5</td>
                            <td class="cell-actions">
                                <button class="btn btn-secondary btn-small">查看</button>
                                <button class="btn btn-secondary btn-small">编辑</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `,
    
    'ai': `
        <div class="page-header">
            <div class="page-breadcrumb">智能问数</div>
            <h1 class="page-title">智能问数</h1>
            <p class="page-subtitle">使用自然语言查询数据，AI 助手为您生成 SQL</p>
        </div>
        
        <div class="section" style="margin-bottom: 24px;">
            <div class="section-content">
                <div class="suggestions">
                    <button class="suggestion-chip">今日销售额是多少？</button>
                    <button class="suggestion-chip">本周活跃用户数量</button>
                    <button class="suggestion-chip">库存低于100的商品</button>
                    <button class="suggestion-chip">上月订单趋势</button>
                </div>
            </div>
        </div>
        
        <div class="chat-container">
            <div class="chat-messages">
                <div class="chat-message assistant">
                    您好！我是数据助手，可以帮您用自然语言查询数据。请描述您想要查询的内容，我会为您生成相应的 SQL 并执行。
                </div>
                <div class="chat-message user">
                    查询今天的销售总额
                </div>
                <div class="chat-message assistant">
                    好的，我来帮您查询今日销售总额：<br><br>
                    <code class="code-text">SELECT SUM(amount) as total_sales FROM orders WHERE DATE(created_at) = CURDATE()</code><br><br>
                    查询结果：今日销售总额为 ¥128,456.00
                </div>
            </div>
            <div class="chat-input-area">
                <input type="text" class="chat-input" placeholder="输入您的问题，例如：查询本月销售前10的产品">
                <button class="btn btn-primary">发送</button>
            </div>
        </div>
    `
};

// ========================================
// 渲染页面
// ========================================
function renderPage(pageName) {
    const actualPage = PageMapping[pageName] || pageName;
    const content = PageContent[actualPage];
    
    if (content) {
        document.getElementById('main-content').innerHTML = content;
        AppState.currentPage = actualPage;
        updateNavigation(actualPage);
    }
}

// ========================================
// 更新导航状态
// ========================================
function updateNavigation(pageName) {
    const parentNav = ReverseMapping[pageName] || pageName;
    
    // 清除所有 active 状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelectorAll('.sub-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // 设置当前页面的导航为 active
    const navItem = document.querySelector(`.nav-item[data-page="${parentNav}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }
    
    // 设置子菜单项为 active
    const subNavItem = document.querySelector(`.sub-nav-item[data-page="${pageName}"]`);
    if (subNavItem) {
        subNavItem.classList.add('active');
    }
    
    // 展开对应的子菜单组
    Object.keys(GroupPages).forEach(group => {
        const groupEl = document.querySelector(`.nav-group[data-group="${group}"]`);
        if (groupEl) {
            if (GroupPages[group].includes(pageName)) {
                groupEl.classList.add('expanded');
                AppState.expandedGroups.add(group);
            }
        }
    });
}

// ========================================
// 切换子菜单展开状态
// ========================================
function toggleGroup(groupName) {
    const groupEl = document.querySelector(`.nav-group[data-group="${groupName}"]`);
    if (groupEl) {
        if (AppState.expandedGroups.has(groupName)) {
            groupEl.classList.remove('expanded');
            AppState.expandedGroups.delete(groupName);
        } else {
            groupEl.classList.add('expanded');
            AppState.expandedGroups.add(groupName);
        }
    }
}

// ========================================
// 初始化
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // 渲染默认页面
    renderPage('dashboard');
    
    // 绑定主导航点击事件
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const page = item.getAttribute('data-page');
            
            // 如果是有子菜单的父级项，切换子菜单展开状态
            if (item.classList.contains('nav-parent')) {
                toggleGroup(page);
                // 同时跳转到默认子页面
                renderPage(page);
            } else {
                renderPage(page);
            }
        });
    });
    
    // 绑定子菜单点击事件
    document.querySelectorAll('.sub-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const page = item.getAttribute('data-page');
            renderPage(page);
        });
    });
});
