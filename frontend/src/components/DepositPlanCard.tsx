import { formatMoney } from '../utils/helpers';
import type { PlanWithBalance, DepositTransaction } from '../types/api';

interface Props {
  plan: PlanWithBalance;
  transactions: DepositTransaction[];
  index: number;
  onEdit: (planId: number) => void;
  onDelete: (planId: number) => void;
  onRecord: (planId: number) => void;
  onDragStart: (idx: number, e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (idx: number, e: React.DragEvent) => void;
  onDrop: (idx: number, e: React.DragEvent) => void;
}

const DepositPlanCard: React.FC<Props> = ({
  plan: pwb, transactions, index, onEdit, onDelete, onRecord,
  onDragStart, onDragEnd, onDragOver, onDrop,
}) => {
  const p = pwb.plan;
  const saved = pwb.balance || 0;
  const pct = p.monthly_goal > 0 ? Math.min((saved / p.monthly_goal) * 100, 100) : 0;

  const recent = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const handleDelete = () => {
    onDelete(p.id);
  };

  return (
    <div
      className="card deposit-plan draggable-plan"
      draggable="true"
      data-plan-idx={index}
      onDragStart={e => onDragStart(index, e)}
      onDragEnd={onDragEnd}
      onDragOver={e => onDragOver(index, e)}
      onDrop={e => onDrop(index, e)}
      style={{ padding: 'calc(16px * var(--S))', marginBottom: 0 }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-light)', cursor: 'grab', fontSize: 12 }} title="拖动排序">
            &#x283F;
          </span>
          <h3 style={{ marginBottom: 0, fontSize: 14 }}>{p.name}</h3>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm btn-outline" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => onEdit(p.id)}>
            编辑
          </button>
          <button className="btn btn-sm btn-danger" style={{ padding: '3px 10px', fontSize: 11 }} onClick={handleDelete}>
            删除
          </button>
        </div>
      </div>

      {/* Info row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: 'var(--text-light)', fontSize: 11, marginBottom: 10 }}>
        <span>{p.category}</span>
        <span>月期望 {formatMoney(p.monthly_goal)}</span>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
          <span style={{ color: 'var(--success)', fontWeight: 600 }}>
            已存 {formatMoney(saved)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>
            {Math.round(pct)}%
          </span>
        </div>
        <div className="deposit-progress-bg">
          <div className="deposit-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Record button */}
      <button className="btn btn-sm btn-outline" style={{ marginBottom: 8 }} onClick={() => onRecord(p.id)}>
        记录存取
      </button>

      {/* Deposit usage records */}
      <div className="deposit-usage">
        <h4 style={{ fontSize: 12, marginBottom: 6 }}>存取记录</h4>
        {recent.length === 0 ? (
          <div className="empty-state" style={{ padding: 8, fontSize: 12 }}>暂无存取记录</div>
        ) : (
          <>
            {recent.map(d => {
              const isWithdraw = d.type === 'withdraw';
              const sign = isWithdraw ? '-' : '+';
              const amtColor = isWithdraw ? 'var(--danger)' : 'var(--success)';
              return (
              <div className="usage-item" key={d.id} style={{ padding: 'calc(5px * var(--S)) calc(8px * var(--S))', fontSize: 11 }}>
                  <span className="usage-amount" style={{ color: amtColor, fontSize: 12 }}>
                    {sign}{formatMoney(d.amount)}
                  </span>
                  <span>{d.date}</span>
                  <span style={{ color: 'var(--text-light)' }}>{d.source}</span>
                </div>
              );
            })}
            {transactions.length > 5 && (
              <div style={{ fontSize: 11, color: 'var(--text-light)', textAlign: 'center', padding: 4 }}>
                ... 共 {transactions.length} 条记录
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DepositPlanCard;
