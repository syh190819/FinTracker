import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Modal,
  Progress,
  Segmented,
  Spin,
  Tag,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { planApi } from '../services/planApi';
import { todoApi } from '../services/todoApi';
import type { Plan, Todo } from '../types/api';
import { PLAN_TYPE_CONFIG, PLAN_TYPES } from '../utils/planTypes';
import { buildTodoTree, type TodoNode } from '../utils/todoTree';
import { formatMoney } from '../utils/helpers';

type Section = 'active' | 'archived' | 'all';

export default function PlansPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [section, setSection] = useState<Section>('active');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [name, setName] = useState('');
  const [deadline, setDeadline] = useState<Dayjs | null>(null);
  const [types, setTypes] = useState<string[]>(['todo']);
  const [incomeGoal, setIncomeGoal] = useState(0);
  const [expenseLimit, setExpenseLimit] = useState(0);
  const [monthlyGoal, setMonthlyGoal] = useState(0);
  const [autoTodo, setAutoTodo] = useState(false);
  const [autoTodoDay, setAutoTodoDay] = useState(28);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  const [txns, setTxns] = useState<Record<number, any[]>>({});
  const [trees, setTrees] = useState<Record<number, Todo[]>>({});
  const [txnModal, setTxnModal] = useState<{ plan: Plan; type: 'deposit' | 'withdraw' } | null>(null);
  const [txnAmount, setTxnAmount] = useState('');
  const [txnDate, setTxnDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [txnSource, setTxnSource] = useState('');
  const [txnSaving, setTxnSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const archived = section === 'archived' ? true : section === 'active' ? false : undefined;
      setPlans(await planApi.list({ archived, type: typeFilter === 'all' ? undefined : typeFilter }));
    } catch {
      message.error('加载计划失败');
    } finally {
      setLoading(false);
    }
  }, [section, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => plans.filter((p) => typeFilter === 'all' || p.plan_types.includes(typeFilter)),
    [plans, typeFilter],
  );

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDeadline(null);
    setTypes(['todo']);
    setIncomeGoal(0); setExpenseLimit(0); setMonthlyGoal(0);
    setAutoTodo(false); setAutoTodoDay(28); setProgress(0);
    setModalOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setName(plan.name);
    setDeadline(plan.deadline ? dayjs(plan.deadline) : null);
    setTypes(plan.plan_types);
    setIncomeGoal(plan.income_goal); setExpenseLimit(plan.expense_limit); setMonthlyGoal(plan.monthly_goal);
    setAutoTodo(plan.auto_todo_enabled); setAutoTodoDay(plan.auto_todo_day); setProgress(plan.progress);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { message.warning('请输入计划名称'); return; }
    if (types.length === 0) { message.warning('请至少选择一个计划类型'); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        deadline: deadline ? deadline.format('YYYY-MM-DD') : null,
        plan_types: types,
        income_goal: incomeGoal,
        expense_limit: expenseLimit,
        monthly_goal: monthlyGoal,
        auto_todo_enabled: autoTodo,
        auto_todo_day: autoTodoDay,
        progress,
      };
      if (editing) await planApi.update(editing.id, payload);
      else await planApi.create(payload);
      message.success(editing ? '已保存' : '已创建');
      setModalOpen(false);
      load();
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const loadTxns = async (plan: Plan) => {
    if (txns[plan.id]) {
      setTxns((prev) => { const n = { ...prev }; delete n[plan.id]; return n; });
      return;
    }
    try {
      const data = await planApi.listTransactions(plan.id);
      setTxns((prev) => ({ ...prev, [plan.id]: data }));
    } catch { /* ignore */ }
  };

  const loadTree = async (plan: Plan) => {
    if (trees[plan.id]) {
      setTrees((prev) => { const n = { ...prev }; delete n[plan.id]; return n; });
      return;
    }
    try {
      const data = await todoApi.list({ plan_id: plan.id });
      setTrees((prev) => ({ ...prev, [plan.id]: data }));
    } catch { message.error('加载任务失败'); }
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

  const handleArchive = (plan: Plan) => {
    Modal.confirm({
      title: '归档计划',
      content: `确认归档 "${plan.name}"？`,
      okText: '归档',
      cancelText: '取消',
      onOk: async () => {
        try { await planApi.update(plan.id, { archived: true }); message.success('已归档'); load(); }
        catch { message.error('归档失败'); }
      },
    });
  };

  const handleDelete = (plan: Plan) => {
    Modal.confirm({
      title: '删除计划',
      content: `确认删除 "${plan.name}"？关联的收支/待办不会被删除。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try { await planApi.delete(plan.id); message.success('已删除'); load(); }
        catch { message.error('删除失败'); }
      },
    });
  };

  const renderTree = (nodes: TodoNode[]) =>
    nodes.map((n) => (
      <div key={n.id} style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
          <span style={{ width: 14, height: 14, borderRadius: 3, background: n.done ? '#1a1a2e' : '#fff', border: '1px solid #ccc', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, flexShrink: 0 }}>
            {n.done ? '✓' : ''}
          </span>
          <span style={{ fontSize: 14, textDecoration: n.done ? 'line-through' : 'none', color: n.done ? '#bbb' : '#333', flex: 1 }}>{n.title}</span>
          {n.children.length > 0 && !n.done && n.children.every((c) => c.done) && (
            <Tag color="green" style={{ marginInlineEnd: 0, fontSize: 11 }}>子待办已全部完成</Tag>
          )}
          <span style={{ fontSize: 12, color: '#aaa' }}>{n.due_date || ''}</span>
        </div>
        {n.children.length > 0 && <div style={{ marginLeft: 28 }}>{renderTree(n.children)}</div>}
      </div>
    ));

  const renderDepositBlock = (plan: Plan) => (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #eee' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <span>余额 {formatMoney(plan.balance)} / 月目标 {formatMoney(plan.monthly_goal)}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <Button size="small" onClick={() => { setTxnModal({ plan, type: 'deposit' }); setTxnAmount(''); setTxnSource(''); setTxnDate(dayjs().format('YYYY-MM-DD')); }}>存入</Button>
          <Button size="small" onClick={() => { setTxnModal({ plan, type: 'withdraw' }); setTxnAmount(''); setTxnSource(''); setTxnDate(dayjs().format('YYYY-MM-DD')); }}>取出</Button>
        </span>
      </div>
      <Progress percent={plan.monthly_goal > 0 ? Math.min(100, Math.round((plan.balance / plan.monthly_goal) * 100)) : 0} size="small" strokeColor="#1a1a2e" />
      {plan.auto_todo_enabled && <div style={{ fontSize: 12, color: '#999' }}>每月 {plan.auto_todo_day} 号自动生成存钱待办</div>}
      <Button type="text" size="small" style={{ padding: 0, marginTop: 4 }} onClick={() => loadTxns(plan)}>
        {txns[plan.id] ? '收起流水' : '查看流水'}
      </Button>
      {txns[plan.id] && (
        <div style={{ marginTop: 6 }}>
          {txns[plan.id].length === 0 ? (
            <div style={{ fontSize: 12, color: '#aaa' }}>暂无流水</div>
          ) : (
            txns[plan.id].slice(0, 10).map((t: any) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid #f5f5f5' }}>
                <span>{t.date} {t.type === 'deposit' ? '存入' : '取出'} {t.source}</span>
                <span style={{ color: t.type === 'deposit' ? '#1e8449' : '#c0392b' }}>
                  {t.type === 'deposit' ? '+' : '-'}{formatMoney(t.amount)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  const renderBudgetBlock = (plan: Plan) => (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e0e0e0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 13 }}>
          收入 {formatMoney(plan.income_total)} / 目标 {formatMoney(plan.income_goal)}
        </span>
        <Button size="small" onClick={() => navigate(`/expenses?type=income&plan_id=${plan.id}&note=${encodeURIComponent(plan.name)}`)}>
          记收入
        </Button>
      </div>
      <Progress percent={plan.income_goal > 0 ? Math.min(100, Math.round((plan.income_total / plan.income_goal) * 100)) : 0} size="small" strokeColor="#1e8449" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '6px 0 4px' }}>
        <span style={{ fontSize: 13 }}>
          支出 {formatMoney(plan.expense_total)} / 上限 {formatMoney(plan.expense_limit)}
        </span>
        <Button size="small" onClick={() => navigate(`/expenses?type=expense&plan_id=${plan.id}&note=${encodeURIComponent(plan.name)}`)}>
          记支出
        </Button>
      </div>
      <Progress percent={plan.expense_limit > 0 ? Math.min(100, Math.round((plan.expense_total / plan.expense_limit) * 100)) : 0} size="small" strokeColor={plan.expense_limit > 0 && plan.expense_total > plan.expense_limit ? '#c0392b' : '#3498db'} />
    </div>
  );

  const renderTodoBlock = (plan: Plan) => (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #eee' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13 }}>
          任务进度 {plan.done_count}/{plan.total_count}
        </span>
        <Button size="small" icon={<PlusOutlined />} onClick={() => navigate(`/todos?plan=${plan.id}`)}>
          添加待办
        </Button>
      </div>
      <Progress percent={plan.progress} size="small" strokeColor="#1a1a2e" />
      <Button type="text" size="small" style={{ padding: 0, marginTop: 4 }} onClick={() => loadTree(plan)}>
        {trees[plan.id] ? '收起任务' : '展开任务'}
      </Button>
      {trees[plan.id] && (
        <div style={{ marginTop: 6 }}>
          {buildTodoTree(trees[plan.id]).length === 0 ? (
            <div style={{ fontSize: 12, color: '#aaa' }}>暂无任务</div>
          ) : (
            renderTree(buildTodoTree(trees[plan.id]))
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(12px, 3vw, 24px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>计划</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建计划</Button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Segmented
          value={section}
          onChange={(v) => setSection(v as Section)}
          options={[
            { label: '进行中', value: 'active' },
            { label: '已归档', value: 'archived' },
            { label: '全部', value: 'all' },
          ]}
        />
        <Segmented
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as string)}
          options={[
            { label: '全部类型', value: 'all' },
            ...PLAN_TYPES.map((t) => ({ label: PLAN_TYPE_CONFIG[t].label, value: t })),
          ]}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : filtered.length === 0 ? (
        <Empty description="暂无计划" style={{ padding: 60 }} />
      ) : (
        filtered.map((plan) => (
          <div key={plan.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e8e8', padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{plan.name}</span>
              {plan.plan_types.map((t) => (
                <Tag key={t} color={PLAN_TYPE_CONFIG[t]?.color}>
                  {PLAN_TYPE_CONFIG[t]?.label}
                </Tag>
              ))}
              {plan.archived && <Tag>已归档</Tag>}
              {plan.deadline && <span style={{ fontSize: 12, color: '#999' }}>截止 {plan.deadline}</span>}
              <div style={{ flex: 1 }} />
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(plan)}>编辑</Button>
              {!plan.archived && <Button size="small" icon={<InboxOutlined />} onClick={() => handleArchive(plan)}>归档</Button>}
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(plan)}>删除</Button>
            </div>

            {plan.plan_types.includes('budget') && renderBudgetBlock(plan)}
            {plan.plan_types.includes('deposit') && renderDepositBlock(plan)}
            {plan.plan_types.includes('todo') && renderTodoBlock(plan)}
          </div>
        ))
      )}

      {/* 新建/编辑计划 */}
      <Modal
        title={editing ? '编辑计划' : '新建计划'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        destroyOnHidden
        width={520}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>名称 *</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="如：年底存 2 万" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>计划类型 *（可多选，可扩展）</div>
          <Checkbox.Group
            value={types}
            onChange={(v) => setTypes(v as string[])}
            options={PLAN_TYPES.map((t) => ({
              label: PLAN_TYPE_CONFIG[t].label,
              value: t,
            }))}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>截止日期</div>
          <DatePicker style={{ width: '100%' }} value={deadline} onChange={(d) => setDeadline(d)} allowClear />
        </div>
        {PLAN_TYPES.map((t) => types.includes(t) && (
          <div key={t} style={{ border: '1px solid #e8e8e8', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#1a1a2e' }}>
              {PLAN_TYPE_CONFIG[t].icon} {PLAN_TYPE_CONFIG[t].label}设置
            </div>
            {t === 'budget' && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>收入目标 (¥)</div>
                  <Input inputMode="decimal" value={incomeGoal ? String(incomeGoal) : ''} onChange={(e) => setIncomeGoal(parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>支出上限 (¥)</div>
                  <Input inputMode="decimal" value={expenseLimit ? String(expenseLimit) : ''} onChange={(e) => setExpenseLimit(parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
              </div>
            )}
            {t === 'deposit' && (
              <>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>月目标 (¥)</div>
                    <Input inputMode="decimal" value={monthlyGoal ? String(monthlyGoal) : ''} onChange={(e) => setMonthlyGoal(parseFloat(e.target.value) || 0)} placeholder="0" />
                  </div>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>每月提醒日</div>
                    <InputNumber min={1} max={28} value={autoTodoDay} onChange={(v) => setAutoTodoDay(v ?? 28)} style={{ width: '100%' }} />
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <Checkbox checked={autoTodo} onChange={(e) => setAutoTodo(e.target.checked)}>
                    自动生成每月存钱待办
                  </Checkbox>
                </div>
              </>
            )}
            {t === 'todo' && (
              <>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>初始进度（有关联待办后自动计算）</div>
                <InputNumber min={0} max={100} value={progress} onChange={(v) => setProgress(v ?? 0)} style={{ width: '100%' }} />
              </>
            )}
          </div>
        ))}
      </Modal>

      {/* 存入/取出弹窗 */}
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
