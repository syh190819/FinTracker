import { useState, useEffect, useCallback } from 'react';
import { Modal, Input, Form, InputNumber, Switch, message } from 'antd';
import DepositPlanCard from '../components/DepositPlanCard';
import { useDialog } from '../components/CustomDialog';
import { todayStr } from '../utils/helpers';
import { depositApi } from '../services/depositApi';
import type { PlanWithBalance, DepositTransaction } from '../types/api';

const DepositPage: React.FC = () => {
  const { showDialog, dialog } = useDialog();
  const [plans, setPlans] = useState<PlanWithBalance[]>([]);
  const [transactionsMap, setTransactionsMap] = useState<Record<number, DepositTransaction[]>>({});
  const [loading, setLoading] = useState(true);

  // Create/Edit modal
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [planForm] = Form.useForm();

  // Record deposit/withdraw modal
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [recordPlanId, setRecordPlanId] = useState<number>(0);
  const [recordType, setRecordType] = useState<'deposit' | 'withdraw'>('deposit');
  const [recordAmount, setRecordAmount] = useState('');
  const [recordDate, setRecordDate] = useState(todayStr());
  const [recordSource, setRecordSource] = useState('');
  const [recordNote, setRecordNote] = useState('');

  // Drag state
  const [dragIdx, setDragIdx] = useState(-1);

  const fetchPlans = async () => {
    try {
      const data = await depositApi.listPlans();
      setPlans(data);
      // Load transactions for each plan
      const txns: Record<number, DepositTransaction[]> = {};
      await Promise.all(
        data.map(async (p) => {
          try {
            txns[p.plan.id] = await depositApi.listTransactions(p.plan.id);
          } catch {
            txns[p.plan.id] = [];
          }
        }),
      );
      setTransactionsMap(txns);
    } catch {
      message.error('获取存款计划失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openCreateModal = () => {
    setEditingPlanId(null);
    planForm.resetFields();
    setPlanModalOpen(true);
  };

  const openEditModal = (planId: number) => {
    const p = plans.find((x) => x.plan.id === planId);
    if (!p) return;
    setEditingPlanId(planId);
    planForm.setFieldsValue({
      name: p.plan.name,
      category: p.plan.category,
      monthlyGoal: p.plan.monthly_goal,
      autoTodoEnabled: p.plan.auto_todo_enabled,
      autoTodoDay: p.plan.auto_todo_day,
    });
    setPlanModalOpen(true);
  };

  const handlePlanSave = async () => {
    try {
      const values = await planForm.validateFields();
      const monthlyGoal = Number(values.monthlyGoal);
      if (editingPlanId) {
        await depositApi.updatePlan(editingPlanId, {
          name: values.name,
          category: values.category,
          monthly_goal: monthlyGoal,
          auto_todo_enabled: values.autoTodoEnabled ?? false,
          auto_todo_day: values.autoTodoDay ?? 28,
        });
        message.success('计划已更新');
      } else {
        await depositApi.createPlan({
          name: values.name,
          category: values.category,
          monthly_goal: monthlyGoal,
          auto_todo_enabled: values.autoTodoEnabled ?? false,
          auto_todo_day: values.autoTodoDay ?? 28,
        });
        message.success('计划已创建');
      }
      setPlanModalOpen(false);
      fetchPlans();
    } catch {
      // validation errors handled by antd
    }
  };

  const handleDeletePlan = async (id: number) => {
    const ok = await showDialog({
      mode: 'confirm',
      title: '确认删除',
      message: '确定删除此存款计划？相关记录也将被删除。',
    });
    if (!ok) return;
    try {
      await depositApi.deletePlan(id);
      message.success('计划已删除');
      fetchPlans();
    } catch {
      message.error('删除失败');
    }
  };

  const openRecordModal = (planId: number) => {
    setRecordPlanId(planId);
    setRecordType('deposit');
    setRecordAmount('');
    setRecordDate(todayStr());
    setRecordSource('');
    setRecordNote('');
    setRecordModalOpen(true);
  };

  const handleRecordSave = async () => {
    const amt = parseFloat(recordAmount);
    if (!amt || amt <= 0) {
      showDialog({ mode: 'alert', title: '提示', message: '请输入有效金额' });
      return;
    }
    if (!recordSource.trim()) {
      showDialog({ mode: 'alert', title: '提示', message: '请输入来源/去向' });
      return;
    }
    try {
      await depositApi.createTransaction(recordPlanId, {
        type: recordType,
        amount: amt,
        date: recordDate,
        source: recordSource.trim(),
        note: recordNote.trim(),
      });
      message.success('记录已保存');
      setRecordModalOpen(false);
      fetchPlans();
    } catch {
      message.error('记录保存失败');
    }
  };

  // Drag handlers
  const handleDragStart = useCallback((idx: number, e: React.DragEvent) => {
    setDragIdx(idx);
    (e.currentTarget as HTMLElement).classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove('dragging');
    document.querySelectorAll('.draggable-plan').forEach((el) => el.classList.remove('drag-over'));
  }, []);

  const handleDragOver = useCallback(
    (idx: number, e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (idx !== dragIdx) {
        document.querySelectorAll('.draggable-plan').forEach((el) => el.classList.remove('drag-over'));
        (e.currentTarget as HTMLElement).classList.add('drag-over');
      }
    },
    [dragIdx],
  );

  const handleDrop = useCallback(
    async (idx: number, e: React.DragEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).classList.remove('drag-over');
      if (dragIdx >= 0 && dragIdx !== idx) {
        // Update sort_order for both plans
        const reordered = [...plans];
        const [moved] = reordered.splice(dragIdx, 1);
        reordered.splice(idx, 0, moved);
        try {
          await Promise.all(
            reordered.map((p, i) =>
              depositApi.updatePlan(p.plan.id, { sort_order: i }),
            ),
          );
          setPlans(reordered);
        } catch {
          message.error('排序失败');
          fetchPlans();
        }
      }
      setDragIdx(-1);
    },
    [dragIdx, plans],
  );

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>;
  }

  return (
    <div>
      {dialog}
      {plans.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="empty-state" style={{ marginBottom: 12 }}>
            暂无存款计划，请创建一个
          </div>
          <button className="btn btn-primary" onClick={openCreateModal}>
            + 创建存款计划
          </button>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={openCreateModal}>
              + 创建存款计划
            </button>
          </div>
          <div className="deposit-plans-grid">
            {plans.map((p, idx) => (
              <DepositPlanCard
                key={p.plan.id}
                plan={p}
                transactions={transactionsMap[p.plan.id] || []}
                index={idx}
                onEdit={openEditModal}
                onDelete={handleDeletePlan}
                onRecord={openRecordModal}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}
          </div>
        </div>
      )}

      {/* Create/Edit Plan Modal */}
      <Modal
        title={editingPlanId ? '编辑存款计划' : '创建存款计划'}
        open={planModalOpen}
        onOk={handlePlanSave}
        onCancel={() => setPlanModalOpen(false)}
        okText={editingPlanId ? '保存修改' : '创建存款计划'}
        cancelText="取消"
        destroyOnHidden
        centered
      >
        <Form
          form={planForm}
          layout="vertical"
          style={{ marginTop: 16 }}
          initialValues={{ autoTodoEnabled: false, autoTodoDay: 28 }}
        >
          <Form.Item label="存款名称" name="name" rules={[{ required: true, message: '请输入存款名称' }]}>
            <Input placeholder="如：旅行基金" />
          </Form.Item>
          <Form.Item label="存款品类" name="category">
            <Input placeholder="如：定期存款、理财" />
          </Form.Item>
          <Form.Item label="每月期望存款 (¥)" name="monthlyGoal" rules={[{ required: true, message: '请输入每月期望存款' }]}>
            <Input type="number" step="0.01" min="0" placeholder="0.00" />
          </Form.Item>
          <Form.Item
            label="自动生成每月存钱待办"
            name="autoTodoEnabled"
            valuePropName="checked"
            tooltip="开启后，每月提醒日会自动出现一条存钱待办"
          >
            <Switch />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.autoTodoEnabled !== cur.autoTodoEnabled}>
            {({ getFieldValue }) =>
              getFieldValue('autoTodoEnabled') ? (
                <Form.Item
                  label="每月提醒日"
                  name="autoTodoDay"
                  rules={[{ required: true, message: '请选择提醒日' }]}
                >
                  <InputNumber min={1} max={28} style={{ width: '100%' }} placeholder="1-28 号" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      {/* Record Deposit Modal */}
      <Modal
        title="记录操作"
        open={recordModalOpen}
        onOk={handleRecordSave}
        onCancel={() => setRecordModalOpen(false)}
        okText="确认记录"
        cancelText="取消"
        destroyOnHidden
        centered
      >
        <div style={{ marginTop: 16 }}>
          <div className="form-row">
            <div className="form-group">
              <label>操作类型</label>
              <select
                value={recordType}
                onChange={(e) => setRecordType(e.target.value as 'deposit' | 'withdraw')}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13 }}
              >
                <option value="withdraw">取出</option>
                <option value="deposit">存入</option>
              </select>
            </div>
            <div className="form-group">
              <label>{recordType === 'withdraw' ? '取出金额 (¥)' : '存入金额 (¥)'}</label>
              <input
                type="number"
                placeholder="0.00"
                step="0.01"
                min="0.01"
                value={recordAmount}
                onChange={(e) => setRecordAmount(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13 }}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>日期</label>
              <input
                type="date"
                value={recordDate}
                onChange={(e) => setRecordDate(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13 }}
              />
            </div>
            <div className="form-group">
              <label>来源/去向</label>
              <input
                type="text"
                placeholder="如：工资、奖金 / 大额消费"
                value={recordSource}
                onChange={(e) => setRecordSource(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13 }}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>备注（可选）</label>
              <input
                type="text"
                placeholder=""
                value={recordNote}
                onChange={(e) => setRecordNote(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13 }}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DepositPage;
