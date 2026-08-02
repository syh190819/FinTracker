-- 001_initial.sql
-- FinTracker 数据库初始化迁移

-- 用户表
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 消费品类表
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(30) NOT NULL,
    excluded BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    deleted_at TIMESTAMP,
    UNIQUE(user_id, name)
);

-- 支出记录表
CREATE TABLE expenses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    category VARCHAR(30) NOT NULL,
    date DATE NOT NULL,
    note TEXT DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

-- 月度预算表
CREATE TABLE budgets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL,
    category VARCHAR(30) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    split_by_day BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP,
    UNIQUE(user_id, month, category)
);

-- 存款计划表
CREATE TABLE deposit_plans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    category VARCHAR(30) DEFAULT '',
    monthly_goal DECIMAL(12,2) DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    deleted_at TIMESTAMP
);

-- 存取流水表
CREATE TABLE deposit_transactions (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES deposit_plans(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL CHECK (type IN ('deposit', 'withdraw')),
    amount DECIMAL(12,2) NOT NULL,
    date DATE NOT NULL,
    source VARCHAR(50) DEFAULT '',
    note TEXT DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

-- 共享关系表
CREATE TABLE sharing (
    id SERIAL PRIMARY KEY,
    user_a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(10) DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    invite_code VARCHAR(20) UNIQUE NOT NULL,
    confirmed_by_b BOOLEAN DEFAULT FALSE,
    scope JSONB DEFAULT '{"expenses":true,"budgets":true,"deposits":true}',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_a_id, user_b_id)
);

-- 性能索引
CREATE INDEX idx_expenses_user_id ON expenses(user_id);
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_budgets_user_month ON budgets(user_id, month);
CREATE INDEX idx_deposit_plans_user ON deposit_plans(user_id);
CREATE INDEX idx_sharing_user_a ON sharing(user_a_id);
CREATE INDEX idx_sharing_user_b ON sharing(user_b_id);
CREATE INDEX idx_expenses_deleted ON expenses(deleted_at);
