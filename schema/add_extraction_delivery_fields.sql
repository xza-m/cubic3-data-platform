-- 为 extraction_runs 表添加交付相关字段
-- 执行日期: 2025-12-22

BEGIN;

-- 添加结果文件路径字段
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS result_file_path TEXT;

-- 添加结果文件大小字段（MB）
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS result_size_mb DOUBLE PRECISION;

-- 添加交付方式字段
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(20);

-- 添加交付详细信息字段
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS delivery_info JSONB DEFAULT '{}'::jsonb;

-- 添加注释
COMMENT ON COLUMN extraction_runs.result_file_path IS '结果文件本地路径';
COMMENT ON COLUMN extraction_runs.result_size_mb IS '结果文件大小（MB）';
COMMENT ON COLUMN extraction_runs.delivery_method IS '交付方式：local, feishu, oss';
COMMENT ON COLUMN extraction_runs.delivery_info IS '交付详细信息（JSON）';

COMMIT;

-- 验证字段添加
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'extraction_runs'
  AND column_name IN ('result_file_path', 'result_size_mb', 'delivery_method', 'delivery_info')
ORDER BY column_name;

