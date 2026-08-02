import { useMemo } from 'react';
import { daysInMonth, formatMoney } from '../utils/helpers';
import type { Expense, Budget, Category } from '../types/api';

interface Props {
  expenses: Expense[];
  budgets: Budget[];
  categories: Category[];
  viewMonth: string;
  onNavigate: (dir: number) => void;
  isCurrent: boolean;
}

const BudgetOverviewCard: React.FC<Props> = ({ expenses, budgets, categories, viewMonth, onNavigate, isCurrent }) => {
  const monthBudgets = useMemo(() => {
    const filtered = budgets.filter(b => b.month === viewMonth);
    if (filtered.length === 0) return null;
    const map: Record<string, { amount: number; splitByDay: boolean }> = {};
    for (const b of filtered) {
      map[b.category] = { amount: b.amount, splitByDay: b.split_by_day };
    }
    return map;
  }, [budgets, viewMonth]);

  // Calculate month expenses by category
  const monthSpent: Record<string, number> = {};
  expenses
    .filter(e => e.date.startsWith(viewMonth))
    .forEach(e => {
      monthSpent[e.category] = (monthSpent[e.category] || 0) + e.amount;
    });

  // Calculate today's expenses (for split-by-day mode)
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todaySpent: Record<string, number> = {};
  expenses
    .filter(e => e.date === todayStr)
    .forEach(e => {
      todaySpent[e.category] = (todaySpent[e.category] || 0) + e.amount;
    });

  const exclCats = categories.filter(c => c.excluded).map(c => c.name);

  // Totals
  let totalBudget = 0;
  let totalSpent = 0;
  let exHousingBudget = 0;
  let exHousingSpent = 0;

  if (monthBudgets) {
    for (const [cat, b] of Object.entries(monthBudgets)) {
      totalBudget += b.amount;
      totalSpent += monthSpent[cat] || 0;
      if (!exclCats.includes(cat)) {
        exHousingBudget += b.amount;
        exHousingSpent += monthSpent[cat] || 0;
      }
    }
  }

  const totalColor = totalSpent > totalBudget ? 'var(--danger)' : totalSpent < totalBudget ? 'var(--success)' : 'var(--text)';

  return (
    <div className="card budget-overview-card">
      <div className="budget-view-header">
        <div className="budget-view-nav">
          <span
            className="budget-nav-btn"
            onClick={() => onNavigate(-1)}
            title="上一个月"
          >
            &#9664;
          </span>
          <h2 className="budget-view-title">
            {isCurrent ? '本月预算管理' : `${viewMonth} 预算管理`}
          </h2>
          <span
            className="budget-nav-btn"
            onClick={() => onNavigate(1)}
            title="下一个月"
            style={{ visibility: isCurrent ? 'hidden' : 'visible' }}
          >
            &#9654;
          </span>
        </div>
        {monthBudgets && (
          <span className="budget-total-summary">
            已花{' '}
            <strong style={{ color: totalColor }}>
              {formatMoney(totalSpent)}
              <span style={{ fontWeight: 400, fontSize: 11 }}>
                ({formatMoney(exHousingSpent)})
              </span>
            </strong>
            {' / '}预算{' '}
            <strong>
              {formatMoney(totalBudget)}
              <span style={{ fontWeight: 400, fontSize: 11 }}>
                ({formatMoney(exHousingBudget)})
              </span>
            </strong>
          </span>
        )}
      </div>

      <div style={{ flex: 1 }}>
        {!monthBudgets || Object.keys(monthBudgets).length === 0 ? (
          <div className="empty-state">当前月份暂无预算设置，请先在「预算管理」中设置</div>
        ) : (
          Object.entries(monthBudgets).map(([cat, b]) => {
            const days = daysInMonth(viewMonth);
            const s = (b.splitByDay && isCurrent) ? (todaySpent[cat] || 0) : (monthSpent[cat] || 0);
            const limit = (b.splitByDay && isCurrent) ? (b.amount / days) : b.amount;
            const remaining = limit - s;
            const overBudget = remaining < 0;
            const pct = Math.min((s / limit) * 100, 100);
            const barColor = remaining < 0 ? '#c0392b' : remaining === 0 ? '#1a1a2e' : '#27ae60';
            const label = (b.splitByDay && isCurrent) ? '今日' : '本月';
            const spentLabel = (b.splitByDay && isCurrent) ? '今日已花' : '已花';

            return (
              <div className="budget-progress-item" key={cat}>
                <div className="bp-header">
                  <span className="bp-cat">
                    {cat}
                    {(!isCurrent && b.splitByDay) && (
                      <span style={{ fontSize: 10, color: 'var(--text-light)', marginLeft: 4 }}>按月计</span>
                    )}
                    {!b.splitByDay && (
                      <span style={{ fontSize: 10, color: 'var(--text-light)', marginLeft: 4 }}>按月</span>
                    )}
                  </span>
                  <span className="bp-amounts">
                    {spentLabel} {formatMoney(s)} / {label} {formatMoney(limit)}
                  </span>
                </div>
                <div className="bp-bar">
                  <div className="bp-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                </div>
                <div className="bp-footer">
                  <span style={{ color: overBudget ? 'var(--danger)' : 'var(--text-light)' }}>
                    {overBudget ? '超支' : '剩余'} {formatMoney(Math.abs(remaining))}
                  </span>
                  <span style={{ fontWeight: 600, color: barColor }}>
                    {Math.round(pct)}%
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default BudgetOverviewCard;
