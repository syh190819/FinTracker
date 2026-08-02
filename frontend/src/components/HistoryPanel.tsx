import { useState } from 'react';
import { formatMoney } from '../utils/helpers';
import type { Expense } from '../types/api';
import type { ShowDialogFn } from './CustomDialog';

interface Props {
  expenses: Expense[];
  onDelete: (id: number) => void;
  showDialog: ShowDialogFn;
}

const HistoryPanel: React.FC<Props> = ({ expenses, onDelete, showDialog }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

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
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{ padding: 'calc(8px * var(--S)) calc(12px * var(--S))', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
            />
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
