-- 002_todos_plans.sql
-- 目标型计划表
CREATE TABLE plans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    deadline DATE,
    progress INTEGER DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

-- 待办事项表
CREATE TABLE todos (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    due_date DATE,
    done BOOLEAN DEFAULT FALSE,
    plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_todos_user ON todos(user_id);
CREATE INDEX idx_todos_plan ON todos(plan_id);
CREATE INDEX idx_plans_user ON plans(user_id);
