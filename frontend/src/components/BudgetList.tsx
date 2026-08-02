import { useState } from 'react';
import { daysInMonth, formatMoney, currentMonthStr } from '../utils/helpers';
import type { Budget, Category } from '../types/api';
import type { ShowDialogFn } from './CustomDialog';

interface Props {
  budgets: Budget[];
  categories: Category[];
  onEditBudget: (id: number, amount: number, split_by_day: boolean) => Promise<void>;
  onDeleteBudget: (id: number) => Promise<void>;
  onDeleteAllInMonth: (month: string) => Promise<void>;
  onCopyBudget: (sourceMonth: string, targetMonth: string) => Promise<void>;
  showDialog: ShowDialogFn;
}

const BudgetList: React.FC<Props> = ({
  budgets, categories, onEditBudget, onDeleteBudget, onDeleteAllInMonth, onCopyBudget, showDialog,
}) => {
  // Group budgets by month
  const grouped = budgets.reduce((acc, b) => {
    if (!acc[b.month]) acc[b.month] = [];
    acc[b.month].push(b);
    return acc;
  }, {} as Record<string, Budget[]>);
  const months = Object.keys(grouped).sort().reverse();

  const [allOpen, setAllOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [editSplit, setEditSplit] = useState(true);
  const curMonth = currentMonthStr();

  // Copy budget state
  const [copySource, setCopySource] = useState(() => {
    const cur = currentMonthStr();
    const [y, m] = cur.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [copyTarget, setCopyTarget] = useState(curMonth);

  const handleEditClick = (b: Budget) => {
    setEditing(b);
    setEditAmount(b.amount);
    setEditSplit(b.split_by_day);
  };

  const handleEditSave = () => {
    if (!editing) return;
    if (!editAmount || editAmount <= 0) return;
    onEditBudget(editing.id, editAmount, editSplit);
    setEditing(null);
  };

  const handleDelete = async (b: Budget) => {
    const ok = await showDialog({
      mode: 'confirm',
      title: '确认',
      message: `确定删除「${b.category}」在 ${b.month} 的预算设置？`,
    });
    if (ok) onDeleteBudget(b.id);
  };

  const handleDeleteAll = async (month: string) => {
    const monthBudgets = budgets.filter(b => b.month === month);
    const count = monthBudgets.length;
    const ok = await showDialog({
      mode: 'confirm',
      title: '确认',
      message: `确定删除 ${month} 的全部 ${count} 项预算设置？此操作不可撤销。`,
    });
    if (ok) onDeleteAllInMonth(month);
  };

  const handleCopy = async (source?: string, target?: string) => {
    const src = source || copySource;
    const tgt = target || copyTarget;
    if (!src) {
      showDialog({ mode: 'alert', title: '提示', message: '请选择来源月份' });
      return;
    }
    if (!tgt) {
      showDialog({ mode: 'alert', title: '提示', message: '请选择目标月份' });
      return;
    }
    if (src === tgt) {
      showDialog({ mode: 'alert', title: '提示', message: '来源月份和目标月份不能相同' });
      return;
    }
    const srcBudgets = budgets.filter(b => b.month === src);
    if (srcBudgets.length === 0) {
      showDialog({ mode: 'alert', title: '提示', message: '来源月份没有预算设置' });
      return;
    }
    const tgtBudgets = budgets.filter(b => b.month === tgt);
    if (tgtBudgets.length > 0) {
      const ok = await showDialog({
        mode: 'confirm',
        title: '确认',
        message: `目标月份 ${tgt} 已有预算设置，是否覆盖？`,
      });
      if (!ok) return;
    }
    await onCopyBudget(src, tgt);
  };

  const handleCopyFromLastMonth = () => {
    const cur = currentMonthStr();
    const [y, m] = cur.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const prev = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setCopySource(prev);
    setCopyTarget(cur);
    handleCopy(prev, cur);
  };

  const toggleAll = () => setAllOpen(v => !v);

  const copyBar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(8px * var(--S))', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--text-light)', whiteSpace: 'nowrap' }}>从</span>
      <input
        type="month"
        value={copySource}
        onChange={e => setCopySource(e.target.value)}
        style={{ padding: 'calc(6px * var(--S)) calc(10px * var(--S))', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}
      />
      <span style={{ fontSize: 12, color: 'var(--text-light)', whiteSpace: 'nowrap' }}>复制预算到</span>
      <input
        type="month"
        value={copyTarget}
        onChange={e => setCopyTarget(e.target.value)}
        style={{ padding: 'calc(6px * var(--S)) calc(10px * var(--S))', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}
      />
      <button className="btn btn-sm btn-outline" onClick={() => handleCopy()}>复制预算</button>
      <button className="btn btn-sm btn-primary" onClick={handleCopyFromLastMonth}>从上一月复制</button>
    </div>
  );

  if (months.length === 0) {
    return (
      <div className="card">
        <h2 style={{ marginBottom: 0 }}>当前预算设置</h2>
        <div className="empty-state">暂无预算设置，可从上月复制</div>
        {/* Copy budget bar — always visible */}
        <div style={{ marginTop: 12 }}>
          {copyBar}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ marginBottom: 0 }}>当前预算设置</h2>
        <span
          className="btn btn-sm btn-outline"
          style={{ cursor: 'pointer', fontSize: 11 }}
          onClick={toggleAll}
        >
          {allOpen ? '收起全部' : '展开全部'}
        </span>
      </div>

      {/* Copy budget — always visible at top */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {copyBar}
      </div>

      <div id="budget-list">
        {months.map((month, idx) => {
          const monthBudgets = grouped[month];
          const days = daysInMonth(month);
          const isCurrent = month === curMonth;
          const groupId = `bg-${idx}`;
          const totalMonth = monthBudgets.reduce((s, b) => s + b.amount, 0);

          return (
            <div className="budget-month-group" key={month}>
              <div
                className="budget-month-header"
                onClick={() => {
                  const el = document.getElementById(groupId);
                  const arrow = document.getElementById(`${groupId}-arrow`);
                  if (el) el.classList.toggle('open');
                  if (arrow) arrow.classList.toggle('open');
                }}
              >
                <span className={`bm-arrow${allOpen ? ' open' : ''}`} id={`${groupId}-arrow`}>
                  &#9654;
                </span>
                <span>{month}</span>
                <span style={{ color: 'var(--text-light)', fontWeight: 400, fontSize: 12 }}>
                  {days}天
                </span>
                <span style={{ marginLeft: 'auto', color: 'var(--text-light)', fontWeight: 400, fontSize: 12 }}>
                  {monthBudgets.length}项 &middot; {formatMoney(totalMonth)}
                </span>
                <button
                  className="btn btn-sm btn-danger"
                  style={{ marginLeft: 'calc(10px * var(--S))', padding: 'calc(2px * var(--S)) calc(8px * var(--S))', fontSize: 11 }}
                  onClick={e => { e.stopPropagation(); handleDeleteAll(month); }}
                  title="删除该月全部预算"
                >
                  删除本月
                </button>
              </div>
              <div className={`budget-month-body${allOpen ? ' open' : ''}`} id={groupId}>
                {monthBudgets.map(b => {
                  const isEditing = editing?.id === b.id;
                  if (isEditing) {
                    return (
                      <div className="budget-bar" key={b.id} style={{ flexWrap: 'wrap', gap: 'calc(8px * var(--S))' }}>
                        <span className="cat-name">{b.category}</span>
                        <input
                          type="number"
                          value={editAmount}
                          onChange={e => setEditAmount(parseFloat(e.target.value) || 0)}
                          placeholder="月预算"
                          step="0.01"
                          min="0"
                          style={{ width: 'calc(140px * var(--S))', padding: 'calc(6px * var(--S)) calc(10px * var(--S))', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
                        />
                        <select
                          value={editSplit ? 'yes' : 'no'}
                          onChange={e => setEditSplit(e.target.value === 'yes')}
                          style={{ padding: 'calc(6px * var(--S)) calc(10px * var(--S))', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
                        >
                          <option value="yes">按天拆分</option>
                          <option value="no">不拆分</option>
                        </select>
                        <span style={{ color: 'var(--text-light)', fontSize: 12 }}>
                          {editSplit ? formatMoney(editAmount / days) : formatMoney(editAmount) + ' (按月)'}
                        </span>
                        <button className="btn btn-sm btn-primary" onClick={handleEditSave}>保存</button>
                        <button className="btn btn-sm btn-outline" onClick={() => setEditing(null)}>取消</button>
                      </div>
                    );
                  }
                  const splitInfo = b.split_by_day
                    ? `每日 ${formatMoney(b.amount / days)}`
                    : '不拆分';
                  return (
                    <div className="budget-bar" key={b.id}>
                      <span className="cat-name">{b.category}</span>
                      <div className="budget-info">
                        <strong>{formatMoney(b.amount)}</strong>
                        <span style={{ color: 'var(--text-light)', fontSize: 11, marginLeft: 6 }}>
                          {splitInfo}
                        </span>
                      </div>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => handleEditClick(b)}
                      >
                        编辑
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(b)}
                      >
                        删除
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BudgetList;
