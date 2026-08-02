/** API 类型 — 与 Rust 后端模型一一对应 */

// === Auth ===
export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user_id: number;
  username: string;
}

// === Categories ===
export interface Category {
  id: number;
  user_id: number;
  name: string;
  excluded: boolean;
  sort_order: number;
  deleted_at: string | null;
}

export interface CreateCategory {
  name: string;
}

export interface UpdateCategory {
  name?: string;
  excluded?: boolean;
  sort_order?: number;
}

// === Expenses ===
export interface Expense {
  id: number;
  user_id: number;
  amount: number;
  category: string;
  date: string;
  note: string;
  created_by: number;
  created_at: string;
  updated_by: number | null;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface ExpenseQuery {
  date?: string;
  month?: string;
  category?: string;
}

export interface CreateExpense {
  amount: number;
  category: string;
  date: string;
  note?: string;
}

export interface UpdateExpense {
  amount?: number;
  category?: string;
  date?: string;
  note?: string;
}

// === Budgets ===
export interface Budget {
  id: number;
  user_id: number;
  month: string;
  category: string;
  amount: number;
  split_by_day: boolean;
  deleted_at: string | null;
}

export interface CreateBudget {
  month: string;
  category: string;
  amount: number;
  split_by_day?: boolean;
}

export interface UpdateBudget {
  amount?: number;
  split_by_day?: boolean;
}

// === Deposits ===
export interface DepositPlan {
  id: number;
  user_id: number;
  name: string;
  category: string;
  monthly_goal: number;
  sort_order: number;
  deleted_at: string | null;
}

export interface PlanWithBalance {
  plan: DepositPlan;
  balance: number;
}

export interface DepositTransaction {
  id: number;
  plan_id: number;
  type: string;
  amount: number;
  date: string;
  source: string;
  note: string;
  created_by: number;
  created_at: string;
  updated_by: number | null;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface CreatePlan {
  name: string;
  category?: string;
  monthly_goal?: number;
}

export interface UpdatePlan {
  name?: string;
  category?: string;
  monthly_goal?: number;
  sort_order?: number;
}

export interface CreateTransaction {
  type: string;
  amount: number;
  date: string;
  source?: string;
  note?: string;
}

// === Sharing ===
export interface SharingWithUsername {
  id: number;
  partner_id: number;
  partner_name: string;
  status: string;
  invite_code: string;
  confirmed_by_b: boolean;
  scope: { expenses: boolean; budgets: boolean; deposits: boolean };
  created_at: string;
}

export interface SharingInviteResponse {
  invite_code: string;
  id: number;
}

export interface SharingScopeUpdate {
  scope: { expenses: boolean; budgets: boolean; deposits: boolean };
}

// === Statistics ===
export interface MonthlyTotal {
  month: string;
  total: number;
}

export interface CategoryTotal {
  category: string;
  total: number;
}

export interface BudgetVsActual {
  category: string;
  budget: number;
  actual: number;
}

// === Todos ===
export interface Todo {
  id: number;
  user_id: number;
  title: string;
  due_date: string | null;
  done: boolean;
  plan_id: number | null;
  plan_name: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface CreateTodo {
  title: string;
  due_date?: string | null;
  plan_id?: number | null;
  done?: boolean;
}

export interface UpdateTodo {
  title?: string;
  due_date?: string | null;
  plan_id?: number | null;
  done?: boolean;
}

// === Plans ===
export interface Plan {
  id: number;
  user_id: number;
  name: string;
  deadline: string | null;
  progress: number;
  done_count: number;
  total_count: number;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface CreatePlan {
  name: string;
  deadline?: string | null;
  progress?: number;
}

export interface UpdatePlan {
  name?: string;
  deadline?: string | null;
  progress?: number;
  archived?: boolean;
}

// === Workbench ===
export interface WorkbenchSummary {
  month_total: number;
  month_budget: number;
  today_todo_count: number;
  open_todo_count: number;
  active_plan_count: number;
  recent_todos: Todo[];
  active_plans: Plan[];
}
