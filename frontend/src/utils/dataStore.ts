/**
 * FinTracker data store — abstracts localStorage (frontend-only mode).
 * When the Rust backend is ready, swap the impl in StoreProvider / useFinanceData.
 *
 * Design: single source of truth via React context + callback-based mutations.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FinanceData, ExpenseRecord, DepositPlan, DepositRecord, BudgetEntry } from '../types';
import { uid, currentMonthStr, todayStr } from './helpers';

// ─── Storage key ────────────────────────────────────────────
const STORAGE_KEY = 'finance_tracker_data';

// ─── Default data ───────────────────────────────────────────
function defaultData(): FinanceData {
  return {
    categories: ['餐饮', '交通', '购物', '娱乐', '住房', '医疗', '教育', '其他'],
    summaryExcludeCategories: ['住房'],
    budgets: {},
    expenses: [],
    depositPlans: [],
  };
}

// ─── Migration (ensures backward compat with HTML version) ──
function migrate(raw: unknown): FinanceData {
  const d = raw as any;
  if (!d || typeof d !== 'object') return defaultData();

  const result: FinanceData = {
    categories: Array.isArray(d.categories) ? d.categories : defaultData().categories,
    summaryExcludeCategories: Array.isArray(d.summaryExcludeCategories) ? d.summaryExcludeCategories
      : (d.categories?.includes('住房') ? ['住房'] : []),
    budgets: {},
    expenses: Array.isArray(d.expenses) ? d.expenses : [],
    depositPlans: [],
  };

  // Migrate budgets
  if (d.budgets && typeof d.budgets === 'object') {
    for (const month of Object.keys(d.budgets)) {
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      const entries = d.budgets[month];
      if (!entries || typeof entries !== 'object') continue;
      const cats: Record<string, BudgetEntry> = {};
      for (const cat of Object.keys(entries)) {
        const e = entries[cat];
        if (e && typeof e === 'object' && e.amount != null && !isNaN(e.amount)) {
          cats[cat] = { amount: e.amount, splitByDay: e.splitByDay !== false };
        }
      }
      if (Object.keys(cats).length > 0) result.budgets[month] = cats;
    }
  }

  // Migrate deposit plans
  if (Array.isArray(d.depositPlans)) {
    result.depositPlans = d.depositPlans.map((p: any) => ({
      id: p.id || uid(),
      name: p.name || '未命名',
      category: p.category || '其他',
      path: p.path || '',
      monthlyGoal: p.monthlyGoal || p.target || 0,
      saved: Array.isArray(p.deposits)
        ? p.deposits.reduce((s: number, dp: DepositRecord) => s + (dp.type === 'withdraw' ? -dp.amount : dp.amount), 0)
        : (p.saved || 0),
      deposits: Array.isArray(p.deposits)
        ? p.deposits.map((dp: any) => ({ ...dp, type: dp.type || 'deposit' }))
        : (Array.isArray(p.usages)
          ? p.usages.map((u: any) => ({
            id: u.id || uid(), amount: u.amount, date: u.date,
            source: u.scene || u.source || '未分类', note: u.note || '', type: 'deposit',
          }))
          : []),
      autoDeposit: p.autoDeposit || { enabled: false, amount: 0, lastAutoMonth: null },
    }));
  }

  return result;
}

// ─── Low-level persistence ──────────────────────────────────
export function loadDataFromStorage(): FinanceData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrate(JSON.parse(raw)) : defaultData();
  } catch {
    return defaultData();
  }
}

export function saveDataToStorage(data: FinanceData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ─── React hook ─────────────────────────────────────────────
export function useFinanceData() {
  const [data, setData] = useState<FinanceData>(loadDataFromStorage);
  const dataRef = useRef(data);
  dataRef.current = data;

  // Persist on every change
  useEffect(() => {
    saveDataToStorage(data);
  }, [data]);

  // ─── Budget operations ──────────────────────────────────
  const setBudget = useCallback((month: string, category: string, amount: number, splitByDay: boolean) => {
    setData(prev => {
      const next = { ...prev, budgets: { ...prev.budgets } };
      if (!next.budgets[month]) next.budgets[month] = {};
      next.budgets[month] = { ...next.budgets[month], [category]: { amount, splitByDay } };
      return next;
    });
  }, []);

  const deleteBudget = useCallback((month: string, category: string) => {
    setData(prev => {
      const next = { ...prev, budgets: { ...prev.budgets } };
      if (next.budgets[month]) {
        const cats = { ...next.budgets[month] };
        delete cats[category];
        if (Object.keys(cats).length === 0) delete next.budgets[month];
        else next.budgets[month] = cats;
      }
      return next;
    });
  }, []);

  const deleteAllBudgetsInMonth = useCallback((month: string) => {
    setData(prev => {
      const next = { ...prev, budgets: { ...prev.budgets } };
      delete next.budgets[month];
      return next;
    });
  }, []);

  const copyBudget = useCallback((sourceMonth: string, targetMonth: string) => {
    setData(prev => {
      const src = prev.budgets[sourceMonth];
      if (!src) return prev;
      const next = { ...prev, budgets: { ...prev.budgets, [targetMonth]: { ...src } } };
      return next;
    });
  }, []);

  // ─── Expense operations ─────────────────────────────────
  const addExpense = useCallback((amount: number, category: string, date: string, note: string) => {
    setData(prev => {
      const rec: ExpenseRecord = {
        id: uid(), amount, category, date: date || todayStr(),
        note: note || '', createdAt: new Date().toISOString(),
      };
      return { ...prev, expenses: [...prev.expenses, rec] };
    });
    return true;
  }, []);

  const deleteExpense = useCallback((id: string) => {
    setData(prev => ({ ...prev, expenses: prev.expenses.filter(e => e.id !== id) }));
  }, []);

  // ─── Category operations ────────────────────────────────
  const addCategory = useCallback((name: string) => {
    setData(prev => {
      if (prev.categories.includes(name)) return prev;
      return { ...prev, categories: [...prev.categories, name] };
    });
  }, []);

  const deleteCategory = useCallback((name: string) => {
    setData(prev => ({
      ...prev,
      categories: prev.categories.filter(c => c !== name),
      summaryExcludeCategories: prev.summaryExcludeCategories.filter(c => c !== name),
      budgets: Object.fromEntries(
        Object.entries(prev.budgets).map(([k, v]) => {
          const cats = { ...v };
          delete cats[name];
          return [k, Object.keys(cats).length > 0 ? cats : undefined];
        }).filter(([_, v]) => v !== undefined)
      ) as Record<string, Record<string, BudgetEntry>>,
    }));
  }, []);

  const toggleSummaryExclude = useCallback((cat: string) => {
    setData(prev => {
      const excl = prev.summaryExcludeCategories.includes(cat)
        ? prev.summaryExcludeCategories.filter(c => c !== cat)
        : [...prev.summaryExcludeCategories, cat];
      return { ...prev, summaryExcludeCategories: excl };
    });
  }, []);

  // ─── Deposit plan operations ────────────────────────────
  const createDepositPlan = useCallback((plan: Omit<DepositPlan, 'id' | 'deposits' | 'saved'> & { initialSaved?: number }) => {
    const { initialSaved, ...rest } = plan;
    const id = uid();
    const saved = initialSaved || 0;
    const deposits: DepositRecord[] = saved > 0
      ? [{ id: uid(), amount: saved, date: todayStr(), source: '初始余额', note: '', type: 'deposit' }]
      : [];
    setData(prev => ({
      ...prev,
      depositPlans: [...prev.depositPlans, { ...rest, id, saved, deposits }],
    }));
    return id;
  }, []);

  const updateDepositPlan = useCallback((id: string, plan: Partial<DepositPlan>) => {
    setData(prev => ({
      ...prev,
      depositPlans: prev.depositPlans.map(p => p.id === id ? { ...p, ...plan } : p),
    }));
  }, []);

  const deleteDepositPlan = useCallback((id: string) => {
    setData(prev => ({
      ...prev,
      depositPlans: prev.depositPlans.filter(p => p.id !== id),
    }));
  }, []);

  const reorderDepositPlans = useCallback((fromIdx: number, toIdx: number) => {
    setData(prev => {
      const plans = [...prev.depositPlans];
      const [moved] = plans.splice(fromIdx, 1);
      plans.splice(toIdx, 0, moved);
      return { ...prev, depositPlans: plans };
    });
  }, []);

  const recordDeposit = useCallback((planId: string, amount: number, date: string, source: string, note: string, type: 'deposit' | 'withdraw') => {
    setData(prev => ({
      ...prev,
      depositPlans: prev.depositPlans.map(p => {
        if (p.id !== planId) return p;
        const deposits = [...p.deposits, { id: uid(), amount, date, source, note, type }];
        const saved = deposits.reduce((s, d) => s + (d.type === 'withdraw' ? -d.amount : d.amount), 0);
        return { ...p, deposits, saved };
      }),
    }));
  }, []);

  const deleteDeposit = useCallback((planId: string, depositId: string) => {
    setData(prev => ({
      ...prev,
      depositPlans: prev.depositPlans.map(p => {
        if (p.id !== planId) return p;
        const deposits = p.deposits.filter(d => d.id !== depositId);
        const saved = deposits.reduce((s, d) => s + (d.type === 'withdraw' ? -d.amount : d.amount), 0);
        return { ...p, deposits, saved };
      }),
    }));
  }, []);

  const confirmDeposit = useCallback((planId: string, depositId: string) => {
    setData(prev => ({
      ...prev,
      depositPlans: prev.depositPlans.map(p => {
        if (p.id !== planId) return p;
        return {
          ...p,
          deposits: p.deposits.map(d => d.id === depositId ? { ...d, confirmed: true } : d),
        };
      }),
    }));
  }, []);

  const toggleAutoDeposit = useCallback((planId: string, enabled: boolean, amount?: number) => {
    setData(prev => ({
      ...prev,
      depositPlans: prev.depositPlans.map(p => {
        if (p.id !== planId) return p;
        const curMonth = currentMonthStr();
        const auto = { enabled, amount: amount || p.monthlyGoal, lastAutoMonth: enabled ? undefined : null };
        // If enabling and not yet processed this month, create auto deposit
        let deposits = p.deposits;
        if (enabled && amount) {
          const hasAutoThisMonth = deposits.some(
            d => d.type === 'deposit' && d.source === '自动存入' && d.date.startsWith(curMonth)
          );
          if (!hasAutoThisMonth) {
            deposits = [...deposits, {
              id: uid(), amount: amount, date: curMonth + '-11',
              source: '自动存入', note: p.name + ' 月度自动存入', type: 'deposit', confirmed: false,
            }];
            const saved = deposits.reduce((s, d) => s + (d.type === 'withdraw' ? -d.amount : d.amount), 0);
            return { ...p, autoDeposit: { enabled, amount, lastAutoMonth: curMonth }, deposits, saved };
          }
        }
        return { ...p, autoDeposit: auto };
      }),
    }));
  }, []);

  // ─── Import / Export ────────────────────────────────────
  const importData = useCallback((imported: FinanceData) => {
    setData(prev => ({
      ...prev,
      categories: imported.categories || prev.categories,
      summaryExcludeCategories: imported.summaryExcludeCategories || [],
      budgets: imported.budgets || {},
      expenses: imported.expenses || [],
      depositPlans: imported.depositPlans || [],
    }));
  }, []);

  const exportData = useCallback((): string => {
    const payload: FinanceData & { exportedAt: string } = {
      ...dataRef.current,
      exportedAt: new Date().toISOString(),
    };
    return JSON.stringify(payload, null, 2);
  }, []);

  return {
    data,
    setData,
    // Budget
    setBudget, deleteBudget, deleteAllBudgetsInMonth, copyBudget,
    // Expense
    addExpense, deleteExpense,
    // Category
    addCategory, deleteCategory, toggleSummaryExclude,
    // Deposit plan
    createDepositPlan, updateDepositPlan, deleteDepositPlan, reorderDepositPlans,
    recordDeposit, deleteDeposit, confirmDeposit, toggleAutoDeposit,
    // Import/Export
    importData, exportData,
  };
}
