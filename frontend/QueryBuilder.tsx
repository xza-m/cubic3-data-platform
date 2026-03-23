/**
 * CUBIC3 - 查询构造器组件
 * 
 * 功能：
 * - 左侧字段树：展示维度和度量，支持勾选
 * - 中间筛选器面板：动态表单，支持日期选择器、多选框
 * - 右侧预览：展示生成的 DSL 结构
 * 
 * 技术栈：React 18 + TypeScript + Tailwind CSS + Lucide Icons
 */

import React, { useState, useEffect } from 'react';
import {
  Filter,
  Database,
  Calendar,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  Play,
  Code,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  Settings,
} from 'lucide-react';

// ============================================================================
// 类型定义
// ============================================================================

interface FieldMeta {
  physicalName: string;
  businessName: string;
  fieldType: string;
  fieldCategory: 'DIMENSION' | 'MEASURE' | 'PARTITION_KEY';
  isSensitive: boolean;
  isSearchable: boolean;
}

interface DatasetInfo {
  datasetId: number;
  datasetCode: string;
  datasetName: string;
  description: string;
  fields: FieldMeta[];
}

interface FilterRule {
  id: string;
  field: string;
  op: string;
  value: any;
}

interface QueryDSL {
  dataset_id: number;
  selected_columns: string[];
  filters: Array<{
    field: string;
    op: string;
    value: any;
  }>;
  order_by?: Array<{
    field: string;
    direction: 'ASC' | 'DESC';
  }>;
  limit?: number;
}

interface ExportTask {
  taskId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  outputRowCount?: number;
  deliveryUrl?: string;
  errorMessage?: string;
}

// ============================================================================
// 主组件
// ============================================================================

export default function QueryBuilder() {
  // 状态管理
  const [dataset, setDataset] = useState<DatasetInfo | null>(null);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [limit, setLimit] = useState<number>(1000);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDSL, setShowDSL] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['DIMENSION', 'MEASURE', 'PARTITION_KEY'])
  );
  const [exportTask, setExportTask] = useState<ExportTask | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 加载数据集元数据（模拟）
  useEffect(() => {
    loadDatasetMetadata();
  }, []);

  const loadDatasetMetadata = async () => {
    // TODO: 替换为真实的 API 调用
    const mockDataset: DatasetInfo = {
      datasetId: 101,
      datasetCode: 'user_order_fact',
      datasetName: '用户订单明细表',
      description: '记录用户在平台的所有订单明细，包含订单金额、商品信息等',
      fields: [
        { physicalName: 'ds', businessName: '数据日期', fieldType: 'STRING', fieldCategory: 'PARTITION_KEY', isSensitive: false, isSearchable: true },
        { physicalName: 'order_id', businessName: '订单ID', fieldType: 'STRING', fieldCategory: 'DIMENSION', isSensitive: false, isSearchable: true },
        { physicalName: 'user_id', businessName: '用户ID', fieldType: 'BIGINT', fieldCategory: 'DIMENSION', isSensitive: false, isSearchable: true },
        { physicalName: 'user_name', businessName: '用户姓名', fieldType: 'STRING', fieldCategory: 'DIMENSION', isSensitive: true, isSearchable: false },
        { physicalName: 'mobile', businessName: '手机号', fieldType: 'STRING', fieldCategory: 'DIMENSION', isSensitive: true, isSearchable: false },
        { physicalName: 'city', businessName: '城市', fieldType: 'STRING', fieldCategory: 'DIMENSION', isSensitive: false, isSearchable: true },
        { physicalName: 'order_amount', businessName: '订单金额', fieldType: 'DECIMAL', fieldCategory: 'MEASURE', isSensitive: false, isSearchable: true },
        { physicalName: 'order_status', businessName: '订单状态', fieldType: 'STRING', fieldCategory: 'DIMENSION', isSensitive: false, isSearchable: true },
        { physicalName: 'created_time', businessName: '创建时间', fieldType: 'DATETIME', fieldCategory: 'DIMENSION', isSensitive: false, isSearchable: true },
      ],
    };
    setDataset(mockDataset);
  };

  // 字段选择处理
  const toggleField = (businessName: string) => {
    const newSelected = new Set(selectedFields);
    if (newSelected.has(businessName)) {
      newSelected.delete(businessName);
    } else {
      newSelected.add(businessName);
    }
    setSelectedFields(newSelected);
  };

  // 添加筛选条件
  const addFilter = () => {
    const newFilter: FilterRule = {
      id: `filter-${Date.now()}`,
      field: '',
      op: 'EQ',
      value: '',
    };
    setFilters([...filters, newFilter]);
  };

  // 删除筛选条件
  const removeFilter = (id: string) => {
    setFilters(filters.filter((f) => f.id !== id));
  };

  // 更新筛选条件
  const updateFilter = (id: string, key: keyof FilterRule, value: any) => {
    setFilters(
      filters.map((f) => (f.id === id ? { ...f, [key]: value } : f))
    );
  };

  // 生成 Query DSL
  const generateQueryDSL = (): QueryDSL => {
    return {
      dataset_id: dataset?.datasetId || 0,
      selected_columns: Array.from(selectedFields),
      filters: filters
        .filter((f) => f.field && f.value !== '')
        .map((f) => ({
          field: f.field,
          op: f.op,
          value: f.value,
        })),
      limit: limit,
    };
  };

  // 提交导出任务
  const handleExport = async () => {
    if (selectedFields.size === 0) {
      alert('请至少选择一个字段');
      return;
    }

    setIsLoading(true);
    const queryDSL = generateQueryDSL();

    try {
      // TODO: 替换为真实的 API 调用
      const response = await fetch('/api/v1/export/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queryDSL),
      });

      const result = await response.json();
      setExportTask({
        taskId: result.task_id,
        status: 'PENDING',
      });

      // 轮询任务状态
      pollTaskStatus(result.task_id);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  // 轮询任务状态
  const pollTaskStatus = async (taskId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/v1/export/status/${taskId}`);
        const task = await response.json();
        setExportTask(task);

        if (task.status === 'SUCCESS' || task.status === 'FAILED') {
          clearInterval(interval);
        }
      } catch (error) {
        console.error('查询任务状态失败:', error);
        clearInterval(interval);
      }
    }, 2000);
  };

  // 过滤字段
  const filteredFields = dataset?.fields.filter((f) =>
    f.businessName.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // 按类别分组
  const fieldsByCategory = {
    PARTITION_KEY: filteredFields.filter((f) => f.fieldCategory === 'PARTITION_KEY'),
    DIMENSION: filteredFields.filter((f) => f.fieldCategory === 'DIMENSION'),
    MEASURE: filteredFields.filter((f) => f.fieldCategory === 'MEASURE'),
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* 头部 */}
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-[1920px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="w-8 h-8 text-teal-400" />
              <div>
                <h1 className="text-2xl font-bold text-white">CUBIC3</h1>
                <p className="text-sm text-slate-400">自助数据导出工具</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowDSL(!showDSL)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-colors"
              >
                <Code className="w-4 h-4" />
                {showDSL ? '隐藏 DSL' : '查看 DSL'}
              </button>
              <button
                onClick={handleExport}
                disabled={isLoading || selectedFields.size === 0}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-semibold rounded-lg shadow-lg shadow-teal-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                导出数据
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 数据集信息 */}
      {dataset && (
        <div className="max-w-[1920px] mx-auto px-6 py-4">
          <div className="bg-gradient-to-r from-teal-500/10 to-cyan-500/10 border border-teal-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Settings className="w-5 h-5 text-teal-400 mt-1" />
              <div>
                <h3 className="text-white font-semibold">{dataset.datasetName}</h3>
                <p className="text-sm text-slate-400 mt-1">{dataset.description}</p>
                <p className="text-xs text-slate-500 mt-1">数据集标识: {dataset.datasetCode}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 主要内容区 */}
      <div className="max-w-[1920px] mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* 左侧：字段选择器 */}
          <div className="col-span-3">
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl shadow-xl">
              <div className="p-4 border-b border-slate-700/50">
                <h2 className="text-lg font-semibold text-white mb-3">字段选择</h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="搜索字段..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="p-4 space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto">
                {/* 分区键 */}
                {fieldsByCategory.PARTITION_KEY.length > 0 && (
                  <FieldCategory
                    title="分区键"
                    fields={fieldsByCategory.PARTITION_KEY}
                    selectedFields={selectedFields}
                    toggleField={toggleField}
                    expanded={expandedCategories.has('PARTITION_KEY')}
                    onToggle={() => toggleCategory('PARTITION_KEY')}
                    icon="🔑"
                  />
                )}

                {/* 维度 */}
                {fieldsByCategory.DIMENSION.length > 0 && (
                  <FieldCategory
                    title="维度字段"
                    fields={fieldsByCategory.DIMENSION}
                    selectedFields={selectedFields}
                    toggleField={toggleField}
                    expanded={expandedCategories.has('DIMENSION')}
                    onToggle={() => toggleCategory('DIMENSION')}
                    icon="📋"
                  />
                )}

                {/* 度量 */}
                {fieldsByCategory.MEASURE.length > 0 && (
                  <FieldCategory
                    title="度量字段"
                    fields={fieldsByCategory.MEASURE}
                    selectedFields={selectedFields}
                    toggleField={toggleField}
                    expanded={expandedCategories.has('MEASURE')}
                    onToggle={() => toggleCategory('MEASURE')}
                    icon="📊"
                  />
                )}
              </div>

              <div className="p-4 border-t border-slate-700/50">
                <div className="text-sm text-slate-400">
                  已选择 <span className="text-teal-400 font-semibold">{selectedFields.size}</span> 个字段
                </div>
              </div>
            </div>
          </div>

          {/* 中间：筛选器面板 */}
          <div className="col-span-6">
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Filter className="w-5 h-5 text-teal-400" />
                  筛选条件
                </h2>
                <button
                  onClick={addFilter}
                  className="flex items-center gap-2 px-3 py-1.5 bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 rounded-lg transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  添加条件
                </button>
              </div>

              <div className="space-y-3 max-h-[calc(100vh-420px)] overflow-y-auto">
                {filters.length === 0 ? (
                  <div className="text-center py-12">
                    <Filter className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-500">暂无筛选条件</p>
                    <p className="text-xs text-slate-600 mt-1">点击上方按钮添加筛选条件</p>
                  </div>
                ) : (
                  filters.map((filter) => (
                    <FilterRow
                      key={filter.id}
                      filter={filter}
                      fields={dataset?.fields || []}
                      onUpdate={updateFilter}
                      onRemove={removeFilter}
                    />
                  ))
                )}
              </div>

              {/* 其他选项 */}
              <div className="mt-6 pt-6 border-t border-slate-700/50">
                <div className="flex items-center gap-4">
                  <label className="text-sm text-slate-400">最大行数</label>
                  <input
                    type="number"
                    value={limit}
                    onChange={(e) => setLimit(parseInt(e.target.value) || 1000)}
                    min="1"
                    max="500000"
                    className="px-3 py-1.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <span className="text-xs text-slate-500">（最大 500,000 行）</span>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：DSL 预览 & 任务状态 */}
          <div className="col-span-3">
            <div className="space-y-6">
              {/* DSL 预览 */}
              {showDSL && (
                <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl shadow-xl p-4">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Code className="w-4 h-4 text-teal-400" />
                    Query DSL
                  </h3>
                  <pre className="text-xs text-slate-300 bg-slate-900/80 p-4 rounded-lg overflow-x-auto">
                    {JSON.stringify(generateQueryDSL(), null, 2)}
                  </pre>
                </div>
              )}

              {/* 任务状态 */}
              {exportTask && (
                <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl shadow-xl p-4">
                  <h3 className="text-sm font-semibold text-white mb-3">导出任务</h3>
                  <TaskStatus task={exportTask} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 子组件
// ============================================================================

interface FieldCategoryProps {
  title: string;
  fields: FieldMeta[];
  selectedFields: Set<string>;
  toggleField: (name: string) => void;
  expanded: boolean;
  onToggle: () => void;
  icon: string;
}

function FieldCategory({ title, fields, selectedFields, toggleField, expanded, onToggle, icon }: FieldCategoryProps) {
  return (
    <div className="border border-slate-700/50 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 bg-slate-900/30 hover:bg-slate-900/50 transition-colors"
      >
        <span className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <span>{icon}</span>
          {title}
          <span className="text-xs text-slate-500">({fields.length})</span>
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="p-2 space-y-1">
          {fields.map((field) => (
            <label
              key={field.physicalName}
              className="flex items-center gap-2 p-2 hover:bg-slate-900/30 rounded cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={selectedFields.has(field.businessName)}
                onChange={() => toggleField(field.businessName)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-teal-500 focus:ring-2 focus:ring-teal-500 focus:ring-offset-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{field.businessName}</div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{field.fieldType}</span>
                  {field.isSensitive && (
                    <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[10px]">
                      敏感
                    </span>
                  )}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface FilterRowProps {
  filter: FilterRule;
  fields: FieldMeta[];
  onUpdate: (id: string, key: keyof FilterRule, value: any) => void;
  onRemove: (id: string) => void;
}

function FilterRow({ filter, fields, onUpdate, onRemove }: FilterRowProps) {
  const searchableFields = fields.filter((f) => f.isSearchable);

  const operators = [
    { value: 'EQ', label: '等于' },
    { value: 'NE', label: '不等于' },
    { value: 'GT', label: '大于' },
    { value: 'GTE', label: '大于等于' },
    { value: 'LT', label: '小于' },
    { value: 'LTE', label: '小于等于' },
    { value: 'IN', label: '包含于' },
    { value: 'BETWEEN', label: '区间' },
    { value: 'LIKE', label: '模糊匹配' },
  ];

  return (
    <div className="flex items-center gap-2 p-3 bg-slate-900/30 border border-slate-700/50 rounded-lg">
      <select
        value={filter.field}
        onChange={(e) => onUpdate(filter.id, 'field', e.target.value)}
        className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
      >
        <option value="">选择字段...</option>
        {searchableFields.map((field) => (
          <option key={field.physicalName} value={field.businessName}>
            {field.businessName}
          </option>
        ))}
      </select>

      <select
        value={filter.op}
        onChange={(e) => onUpdate(filter.id, 'op', e.target.value)}
        className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      <input
        type="text"
        value={filter.value}
        onChange={(e) => onUpdate(filter.id, 'value', e.target.value)}
        placeholder="值"
        className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
      />

      <button
        onClick={() => onRemove(filter.id)}
        className="p-1.5 hover:bg-red-500/20 text-red-400 rounded transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

interface TaskStatusProps {
  task: ExportTask;
}

function TaskStatus({ task }: TaskStatusProps) {
  const statusConfig = {
    PENDING: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/20', label: '等待中' },
    RUNNING: { icon: Loader2, color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: '执行中' },
    SUCCESS: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/20', label: '成功' },
    FAILED: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/20', label: '失败' },
  };

  const config = statusConfig[task.status];
  const Icon = config.icon;

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 p-3 ${config.bg} rounded-lg`}>
        <Icon className={`w-5 h-5 ${config.color} ${task.status === 'RUNNING' || task.status === 'PENDING' ? 'animate-spin' : ''}`} />
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">{config.label}</div>
          <div className="text-xs text-slate-400">任务 ID: {task.taskId}</div>
        </div>
      </div>

      {task.outputRowCount !== undefined && (
        <div className="text-sm text-slate-300">
          导出行数: <span className="text-teal-400 font-semibold">{task.outputRowCount.toLocaleString()}</span>
        </div>
      )}

      {task.status === 'SUCCESS' && task.deliveryUrl && (
        <a
          href={task.deliveryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors"
        >
          下载文件
        </a>
      )}

      {task.status === 'FAILED' && task.errorMessage && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-400">{task.errorMessage}</p>
        </div>
      )}
    </div>
  );
}
