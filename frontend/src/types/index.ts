/** 旧版类型 — 保留用于兼容。新代码使用 types/api.ts */

export interface BudgetEntry {
  amount: number;
  splitByDay: boolean;
}

export interface ExpenseRecord {
  id: string;
  amount: number;
  category: string;
  date: string;
  note: string;
  createdAt: string;
}

export interface DepositRecord {
  id: string;
  amount: number;
  date: string;
  source: string;
  note: string;
  type: 'deposit' | 'withdraw';
  confirmed?: boolean;
}

export interface AutoDepositConfig {
  enabled: boolean;
  amount: number;
  lastAutoMonth: string | null;
}

export interface DepositPlan {
  id: string;
  name: string;
  category: string;
  path: string;
  monthlyGoal: number;
  saved: number;
  deposits: DepositRecord[];
  autoDeposit?: AutoDepositConfig;
}

export interface FinanceData {
  categories: string[];
  summaryExcludeCategories: string[];
  budgets: Record<string, Record<string, BudgetEntry>>;
  expenses: ExpenseRecord[];
  depositPlans: DepositPlan[];
}

export type TabKey = 'expense' | 'budget' | 'deposit';
