-- 添加 total_price 字段到 reservations 表，并更新 status 枚举类型

-- 检查 total_price 字段是否已存在
SET @exist_total_price := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'total_price'
);

-- 如果 total_price 字段不存在，则添加
SET @add_total_price_sql := IF(@exist_total_price = 0,
    'ALTER TABLE reservations ADD COLUMN total_price DECIMAL(10,2) AFTER status',
    'SELECT "total_price column already exists" AS message'
);

PREPARE add_total_price_stmt FROM @add_total_price_sql;
EXECUTE add_total_price_stmt;
DEALLOCATE PREPARE add_total_price_stmt;

-- 计算并更新所有现有预订的 total_price 字段
UPDATE reservations r
JOIN fields f ON r.field_id = f.id
SET r.total_price = 
    CASE 
        WHEN r.total_price IS NULL THEN
            f.price_per_hour * (
                TIME_TO_SEC(TIMEDIFF(r.end_time, r.start_time)) / 3600
            )
        ELSE r.total_price
    END
WHERE r.total_price IS NULL;

-- 修改 status 枚举类型添加 'completed' 值
-- 需要先获取当前的枚举类型定义
SET @enum_values := (
    SELECT SUBSTRING(COLUMN_TYPE, 6, LENGTH(COLUMN_TYPE) - 6)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'status'
);

-- 检查是否已包含 'completed'
SET @has_completed := (
    SELECT LOCATE("'completed'", @enum_values)
);

-- 如果没有包含 'completed'，则修改枚举类型
SET @alter_enum_sql := IF(@has_completed = 0,
    CONCAT('ALTER TABLE reservations MODIFY COLUMN status ENUM', 
          REPLACE(@enum_values, ')', ",'completed')"), 
          ' DEFAULT "pending"'),
    'SELECT "completed status already exists" AS message'
);

PREPARE alter_enum_stmt FROM @alter_enum_sql;
EXECUTE alter_enum_stmt;
DEALLOCATE PREPARE alter_enum_stmt;

-- 更新过期的预订为 'completed' 状态
UPDATE reservations
SET status = 'completed'
WHERE status = 'confirmed'
AND (
    (reservation_date < CURDATE()) OR 
    (reservation_date = CURDATE() AND end_time < CURTIME())
);

-- 显示迁移完成信息
SELECT 'Migration completed successfully' AS migration_status; 