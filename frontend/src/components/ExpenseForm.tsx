import { useState, useEffect } from 'react';
import { formatMoney, todayStr } from '../utils/helpers';
import type { ShowDialogFn } from './CustomDialog';
import type { Plan } from '../types/api';

interface Props {
  categoryNames: string[];
  plans: Plan[];
  initialPlanId?: number;
  initialNote?: string;
  initialType?: 'expense' | 'income';
  onAdd: (amount: number, category: string, date: string, note: string, planId?: number | null, type?: string) => void;
  todayTotal: number;
  todayCount: number;
  showDialog: ShowDialogFn;
}

const ExpenseForm: React.FC<Props> = ({
  categoryNames, plans, initialPlanId, initialNote,
  initialType,
  onAdd, todayTotal, todayCount, showDialog,
}) => {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [planId, setPlanId] = useState<number | undefined>(undefined);
  const [type, setType] = useState<'expense' | 'income'>(initialType || 'expense');

  useEffect(() => {
    setDate(todayStr());
    if (initialNote) setNote(initialNote);
    if (initialPlanId !== undefined) setPlanId(initialPlanId);
  }, [initialNote, initialPlanId, initialType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      showDialog({ mode: 'alert', title: '提示', message: '请输入有效金额' });
      return;
    }
    if (!category) {
      showDialog({ mode: 'alert', title: '提示', message: '请选择品类' });
      return;
    }
    onAdd(amt, category, date, note, planId, type);
    setAmount('');
    setNote('');
    setPlanId(undefined);
    setType('expense');
  };

  return (
    <div className="card" style={{ minHeight: 235 }}>
      <h2>记一笔</h2>

      <div className="summary-grid today-summary">
        <div className="summary-item">
          <div className="val" style={{ color: 'var(--danger)' }}>
            {todayCount === 0 ? '--' : formatMoney(todayTotal)}
          </div>
          <div className="lbl">今日总支出</div>
        </div>
        <div className="summary-item">
          <div className="val">{todayCount === 0 ? '--' : todayCount}</div>
          <div className="lbl">记录笔数</div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
      <div className="form-row">
        <div className="form-group">
          <label>类型</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as 'expense' | 'income')}
          >
            <option value="expense">支出</option>
            <option value="income">收入</option>
          </select>
        </div>
        <div className="form-group">
          <label>金额 (¥)</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
          </div>
          <div className="form-group">
            <label>品类</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              required
            >
              <option value="" disabled>请选择品类</option>
              {categoryNames.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>日期</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>关联计划（可选）</label>
            <select
              value={planId ?? ''}
              onChange={e => setPlanId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">不关联</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group" style={{ flex: 3 }}>
            <label>备注（可选）</label>
            <input
              type="text"
              placeholder="如：午餐外卖"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
        </div>
        <button type="submit" className="btn btn-primary">记录支出</button>
      </form>
    </div>
  );
};

export default ExpenseForm;
