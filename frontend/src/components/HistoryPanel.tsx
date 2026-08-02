import { useEffect, useState } from 'react';
import { daysInMonth, formatMoney } from '../utils/helpers';
import type { Expense } from '../types/api';
import type { ShowDialogFn } from './CustomDialog';

interface Props {
  expenses: Expense[];
  onDelete: (id: number) => void;
  showDialog: ShowDialogFn;
  viewMonth: string;
}

const HistoryPanel: React.FC<Props> = ({ expenses, onDelete, showDialog, viewMonth }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [date, setDate] = useState('');

  // 跟随预算管理的月份：当月内取今天，否则取当月 1 号
  useEffect(() => {
    const d = new Date();
    const curMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (curMonth === viewMonth) {
      setDate(`${curMonth}-${String(d.getDate()).padStart(2, '0')}`);
    } else {
      setDate(`${viewMonth}-01`);
    }
  }, [viewMonth]);

  const monthStart = `${viewMonth}-01`;
  const monthEnd = `${viewMonth}-${String(daysInMonth(viewMonth)).padStart(2, '0')}`;

  const records = expenses
    .filter(e => e.date === date)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const handleDelete = async (id: number) => {
    const ok = await showDialog({ mode: 'confirm', title: '确认', message: '确定删除这条记录？' });
    if (ok) onDelete(id);
  };

  return (
    <div className="card">
      <div className="history-toggle" onClick={() => setIsOpen(v => !v)}>
        <h2 style={{ marginBottom: 0 }}>已记录</h2>
        <span
          className="history-toggle-arrow"
          style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(0deg)' }}
        >
          {isOpen ? '▼' : '▶'}
        </span>
      </div>

      {isOpen && (
        <div style={{ marginTop: 14 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text-light)' }}>{viewMonth}</span>
              <input
                type="date"
                value={date}
                min={monthStart}
                max={monthEnd}
                onChange={e => setDate(e.target.value)}
                style={{ padding: 'calc(8px * var(--S)) calc(12px * var(--S))', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
              />
            </div>
          </div>
          <div className="record-list">
            {records.length === 0 ? (
              <div className="empty-state">该日期没有记录</div>
            ) : (
              records.map(r => (
                <div className="record-item" key={r.id}>
                  <span className="rec-cat">{r.category}</span>
                  <span className="rec-amount" style={{ color: r.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                    {r.type === 'income' ? '+' : '-'}{formatMoney(r.amount)}
                  </span>
                  <span className="rec-date">{r.date}</span>
                  {r.plan_name && (
                    <span
                      style={{
                        fontSize: 11,
                        background: '#f0f0f0',
                        borderRadius: 3,
                        padding: '1px 6px',
                        color: '#666',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.plan_name}
                    </span>
                  )}
                  <span className="rec-note">{r.note || ''}</span>
                  <span className="rec-del" onClick={() => handleDelete(r.id)}>&times;</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryPanel;
