-- 003_linkage_todos_plans.sql
-- 待办父子关系（分级，最多三级）
ALTER TABLE todos ADD COLUMN parent_id INTEGER REFERENCES todos(id) ON DELETE CASCADE;

-- 自动生成的存钱待办关联的存款计划
ALTER TABLE todos ADD COLUMN deposit_plan_id INTEGER REFERENCES deposit_plans(id) ON DELETE SET NULL;

-- 支出关联目标计划
ALTER TABLE expenses ADD COLUMN plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL;

-- 存款计划：每月自动生成存钱待办开关 + 提醒日
ALTER TABLE deposit_plans
    ADD COLUMN auto_todo_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN auto_todo_day INTEGER DEFAULT 28 CHECK (auto_todo_day BETWEEN 1 AND 28);

CREATE INDEX idx_todos_parent ON todos(parent_id);
CREATE INDEX idx_expenses_plan ON expenses(plan_id);
