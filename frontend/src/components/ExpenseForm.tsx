import { useState, useEffect } from 'react';
import { formatMoney, todayStr } from '../utils/helpers';
import type { ShowDialogFn } from './CustomDialog';

interface Props {
  categoryNames: string[];
  onAdd: (amount: number, category: string, date: string, note: string) => void;
  todayTotal: number;
  todayCount: number;
  showDialog: ShowDialogFn;
}

const ExpenseForm: React.FC<Props> = ({ categoryNames, onAdd, todayTotal, todayCount, showDialog }) => {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');

  useEffect(() => {
    setDate(todayStr());
  }, []);

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
    onAdd(amt, category, date, note);
    setAmount('');
    setNote('');
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
            <label>金额 (¥)</label>
            <input
              type="number"
              placeholder="0.00"
              step="0.01"
              min="0"
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
