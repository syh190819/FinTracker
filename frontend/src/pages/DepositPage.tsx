import { useCallback, useEffect, useState } from 'react';
import { Button, Empty, Input, Modal, Progress, Spin, Tag, message } from 'antd';
import { BankOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import { planApi } from '../services/planApi';
import type { Plan } from '../types/api';
import { formatMoney } from '../utils/helpers';

export default function DepositPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [txns, setTxns] = useState<Record<number, any[]>>({});
  const [txnModal, setTxnModal] = useState<{ plan: Plan; type: 'deposit' | 'withdraw' } | null>(null);
  const [txnAmount, setTxnAmount] = useState('');
  const [txnDate, setTxnDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [txnSource, setTxnSource] = useState('');
  const [txnSaving, setTxnSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlans(await planApi.list({ type: 'deposit', archived: false }));
    } catch {
      message.error('加载存款计划失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // FAB 快捷入口：?action=deposit|withdraw 自动打开第一个存款计划的对应弹窗
  useEffect(() => {
    const action = new URLSearchParams(location.search).get('action');
    if ((action === 'deposit' || action === 'withdraw') && plans.length > 0) {
      setTxnModal({ plan: plans[0], type: action });
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, plans]);

  const toggleTxns = async (plan: Plan) => {
    if (txns[plan.id]) {
      setTxns((prev) => { const n = { ...prev }; delete n[plan.id]; return n; });
      return;
    }
    try {
      const data = await planApi.listTransactions(plan.id);
      setTxns((prev) => ({ ...prev, [plan.id]: data }));
    } catch { /* ignore */ }
  };

  const submitTxn = async () => {
    const amt = parseFloat(txnAmount);
    if (!txnModal || !amt || amt <= 0) { message.warning('请输入有效金额'); return; }
    setTxnSaving(true);
    try {
      await planApi.createTransaction(txnModal.plan.id, {
        type: txnModal.type,
        amount: amt,
        date: txnDate,
        source: txnSource || undefined,
      });
      message.success('已记录');
      const pid = txnModal.plan.id;
      setTxnModal(null);
      setTxnAmount(''); setTxnSource('');
      setTxns((prev) => { const n = { ...prev }; delete n[pid]; return n; });
      load();
    } catch {
      message.error('操作失败');
    } finally {
      setTxnSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(12px, 3vw, 24px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>存款</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/plans')}>
          新建存款计划
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : plans.length === 0 ? (
        <Empty description="暂无存款计划，去「计划」页创建一个吧" style={{ padding: 60 }} />
      ) : (
        plans.map((plan) => (
          <div key={plan.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e8e8', padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <BankOutlined style={{ color: '#1a1a2e' }} />
              <span style={{ fontWeight: 700, fontSize: 16 }}>{plan.name}</span>
              <Tag color="geekblue">存款计划</Tag>
              {plan.auto_todo_enabled && <Tag>每月 {plan.auto_todo_day} 号提醒</Tag>}
              <span style={{ fontSize: 13, color: '#999' }}>
                余额 {formatMoney(plan.balance)} / 月目标 {formatMoney(plan.monthly_goal)}
              </span>
              <div style={{ flex: 1 }} />
              <Button size="small" onClick={() => { setTxnModal({ plan, type: 'deposit' }); setTxnAmount(''); setTxnSource(''); setTxnDate(dayjs().format('YYYY-MM-DD')); }}>存入</Button>
              <Button size="small" onClick={() => { setTxnModal({ plan, type: 'withdraw' }); setTxnAmount(''); setTxnSource(''); setTxnDate(dayjs().format('YYYY-MM-DD')); }}>取出</Button>
              <Button size="small" onClick={() => toggleTxns(plan)}>{txns[plan.id] ? '收起流水' : '流水'}</Button>
            </div>
            <Progress percent={plan.monthly_goal > 0 ? Math.min(100, Math.round((plan.balance / plan.monthly_goal) * 100)) : 0} strokeColor="#1a1a2e" style={{ marginTop: 10 }} />
            {txns[plan.id] && (
              <div style={{ marginTop: 8 }}>
                {txns[plan.id].length === 0 ? (
                  <div style={{ fontSize: 13, color: '#aaa' }}>暂无流水</div>
                ) : (
                  txns[plan.id].map((t: any) => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
                      <span>{t.date} {t.type === 'deposit' ? '存入' : '取出'} {t.source} {t.note}</span>
                      <span style={{ color: t.type === 'deposit' ? '#1e8449' : '#c0392b' }}>
                        {t.type === 'deposit' ? '+' : '-'}{formatMoney(t.amount)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))
      )}

      <Modal
        title={txnModal ? `${txnModal.type === 'deposit' ? '存入' : '取出'} - ${txnModal.plan.name}` : ''}
        open={!!txnModal}
        onOk={submitTxn}
        onCancel={() => setTxnModal(null)}
        okText="确认"
        cancelText="取消"
        confirmLoading={txnSaving}
        destroyOnHidden
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>金额 (¥) *</div>
          <Input inputMode="decimal" value={txnAmount} onChange={(e) => setTxnAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>日期</div>
          <Input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>来源（可选）</div>
          <Input value={txnSource} onChange={(e) => setTxnSource(e.target.value)} placeholder="如：工资" />
        </div>
      </Modal>
    </div>
  );
}
