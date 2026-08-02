-- 004_plan_center.sql
-- 计划中心重构：统一计划模型 + 收支类型 + 存款计划合并

-- 1) plans 扩展：类型标签 + 预算/存款专属字段
ALTER TABLE plans
    ADD COLUMN plan_types TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN income_goal DECIMAL(12,2) DEFAULT 0,
    ADD COLUMN expense_limit DECIMAL(12,2) DEFAULT 0,
    ADD COLUMN monthly_goal DECIMAL(12,2) DEFAULT 0,
    ADD COLUMN auto_todo_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN auto_todo_day INTEGER DEFAULT 28 CHECK (auto_todo_day BETWEEN 1 AND 28);

-- 2) 收支类型
ALTER TABLE expenses ADD COLUMN type VARCHAR(10) NOT NULL DEFAULT 'expense'
    CHECK (type IN ('expense','income'));

-- 3) 迁移 deposit_plans -> plans（保留软删状态），记录映射
CREATE TEMP TABLE dep_map (old_id INTEGER PRIMARY KEY, new_id INTEGER);

DO $$
DECLARE
    r RECORD;
    new_plan_id INTEGER;
BEGIN
    FOR r IN SELECT id, user_id, name, monthly_goal, auto_todo_enabled, auto_todo_day, deleted_at
             FROM deposit_plans LOOP
        INSERT INTO plans (user_id, name, plan_types, monthly_goal, auto_todo_enabled, auto_todo_day, deleted_at)
        VALUES (r.user_id, r.name, ARRAY['deposit'], r.monthly_goal, r.auto_todo_enabled, r.auto_todo_day, r.deleted_at)
        RETURNING id INTO new_plan_id;
        INSERT INTO dep_map (old_id, new_id) VALUES (r.id, new_plan_id);
    END LOOP;
END $$;

-- 4) 存取流水与自动存钱待办改挂到统一计划
ALTER TABLE deposit_transactions DROP CONSTRAINT deposit_transactions_plan_id_fkey;
UPDATE deposit_transactions dt SET plan_id = m.new_id FROM dep_map m WHERE dt.plan_id = m.old_id;
ALTER TABLE deposit_transactions ADD CONSTRAINT deposit_transactions_plan_id_fkey
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE;

ALTER TABLE todos DROP CONSTRAINT todos_deposit_plan_id_fkey;
UPDATE todos t SET deposit_plan_id = m.new_id, plan_id = m.new_id FROM dep_map m WHERE t.deposit_plan_id = m.old_id;
ALTER TABLE todos ADD CONSTRAINT todos_deposit_plan_id_fkey
    FOREIGN KEY (deposit_plan_id) REFERENCES plans(id) ON DELETE SET NULL;

-- 5) 删除旧表
DROP TABLE deposit_plans;

-- 6) 现有计划默认补 todo 类型
UPDATE plans SET plan_types = ARRAY['todo'] WHERE plan_types = '{}';

-- 7) 类型索引（GIN）
CREATE INDEX idx_plans_types ON plans USING GIN (plan_types);
