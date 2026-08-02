import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import BudgetOverviewCard from '../components/BudgetOverviewCard';
import ExpenseForm from '../components/ExpenseForm';
import HistoryPanel from '../components/HistoryPanel';
import { useDialog } from '../components/CustomDialog';
import { currentMonthStr, todayStr } from '../utils/helpers';
import { expenseApi } from '../services/expenseApi';
import { categoryApi } from '../services/categoryApi';
import { budgetApi } from '../services/budgetApi';
import { planApi } from '../services/planApi';
import type { Expense, Category, Budget } from '../types/api';

const ExpensePage: React.FC = () => {
  const [viewMonth, setViewMonth] = useState(currentMonthStr());
  const isCurrent = viewMonth === currentMonthStr();
  const rightRef = useRef<HTMLDivElement>(null);
  const { showDialog, dialog } = useDialog();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof planApi.list>>>([]);

  // 从 URL 读取快捷记账参数（计划页"记一笔"跳转）
  const [initialPlanId, setInitialPlanId] = useState<number | undefined>(() => {
    const p = new URLSearchParams(window.location.search).get('plan_id');
    return p ? Number(p) : undefined;
  });
  const [initialNote, setInitialNote] = useState<string | undefined>(() => {
    const n = new URLSearchParams(window.location.search).get('note');
    return n || undefined;
  });

  const fetchExpenses = useCallback(async () => {
    try {
      const data = await expenseApi.list();
      setExpenses(data);
    } catch {
      message.error('获取支出记录失败');
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await categoryApi.list();
      setCategories(data);
    } catch {
      message.error('获取品类失败');
    }
  }, []);

  const fetchBudgets = useCallback(async (month: string) => {
    try {
      const data = await budgetApi.list(month);
      setBudgets(data);
    } catch {
      message.error('获取预算失败');
    }
  }, []);

  const fetchPlans = useCallback(async () => {
    try {
      setPlans(await planApi.list({ archived: false }));
    } catch {
      message.error('获取计划失败');
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchExpenses();
    fetchCategories();
    fetchPlans();
  }, [fetchExpenses, fetchCategories, fetchPlans]);

  // Reload budgets when viewMonth changes
  useEffect(() => {
    fetchBudgets(viewMonth);
  }, [viewMonth, fetchBudgets]);

  const handleAddExpense = useCallback(async (
    amount: number,
    category: string,
    date: string,
    note: string,
    planId?: number | null,
  ) => {
    try {
      await expenseApi.create({ amount, category, date, note, plan_id: planId ?? null });
      message.success('记录成功');
      fetchExpenses();
      if (viewMonth === currentMonthStr()) {
        fetchBudgets(viewMonth);
      }
      // 清除快捷记账参数
      if (window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
        setInitialPlanId(undefined);
        setInitialNote(undefined);
      }
    } catch {
      message.error('记录失败');
    }
  }, [fetchExpenses, fetchBudgets, viewMonth]);

  const handleDeleteExpense = useCallback(async (id: number) => {
    try {
      await expenseApi.delete(id);
      message.success('删除成功');
      fetchExpenses();
      fetchBudgets(viewMonth);
    } catch {
      message.error('删除失败');
    }
  }, [fetchExpenses, fetchBudgets, viewMonth]);

  const handleNavigate = useCallback((dir: number) => {
    setViewMonth(prev => {
      const [y, m] = prev.split('-').map(Number);
      const d = new Date(y, m - 1 + dir, 1);
      const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cur = currentMonthStr();
      return newMonth > cur ? prev : newMonth;
    });
  }, []);

  // Today's expenses
  const today = todayStr();
  const todayExpenses = expenses.filter(e => e.date === today);
  const todayTotal = todayExpenses.reduce((s, e) => s + e.amount, 0);
  const todayCount = todayExpenses.length;

  const categoryNames = categories.map(c => c.name);

  return (
    <div>
      <div className="two-col">
        {/* Left: budget overview */}
        <div>
          <BudgetOverviewCard
            expenses={expenses}
            budgets={budgets}
            categories={categories}
            viewMonth={viewMonth}
            onNavigate={handleNavigate}
            isCurrent={isCurrent}
          />
        </div>

        {/* Right: expense form + history */}
        <div ref={rightRef} style={{ display: 'flex', flexDirection: 'column' }}>
          <ExpenseForm
            categoryNames={categoryNames}
            plans={plans}
            initialPlanId={initialPlanId}
            initialNote={initialNote}
            onAdd={handleAddExpense}
            todayTotal={todayTotal}
            todayCount={todayCount}
            showDialog={showDialog}
          />
          <HistoryPanel
            expenses={expenses}
            onDelete={handleDeleteExpense}
            showDialog={showDialog}
          />
        </div>
      </div>
      {dialog}
    </div>
  );
};

export default ExpensePage;
