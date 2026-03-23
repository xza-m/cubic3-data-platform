-- 统一数据集元数据同步状态
-- 将现有 active 和 pending 状态统一为 synced

-- 更新所有 active 和 pending 状态为 synced
UPDATE datasets 
SET sync_status = 'synced' 
WHERE sync_status IN ('active', 'pending');

-- 添加注释说明状态含义
COMMENT ON COLUMN datasets.sync_status IS '元数据同步状态: synced=已同步, syncing=同步中, failed=同步失败';

-- 查询更新结果
SELECT sync_status, COUNT(*) as count
FROM datasets
WHERE is_deleted = false
GROUP BY sync_status
ORDER BY sync_status;
