import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Input,
  List,
  Modal,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  message,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { todoApi } from '../services/todoApi';
import { planApi } from '../services/planApi';
import type { Plan, Todo } from '../types/api';
import { todayStr } from '../utils/helpers';

type FilterKey = 'all' | 'open' | 'done';

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [planFilter, setPlanFilter] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState<Dayjs | null>(null);
  const [planId, setPlanId] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const today = todayStr();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { done?: boolean; plan_id?: number } = {};
      if (filter === 'open') params.done = false;
      if (filter === 'done') params.done = true;
      if (planFilter !== undefined) params.plan_id = planFilter;
      const [todoData, planData] = await Promise.all([
        todoApi.list(params),
        planApi.list({ archived: false }),
      ]);
      setTodos(todoData);
      setPlans(planData);
    } catch {
      message.error('加载待办失败');
    } finally {
      setLoading(false);
    }
  }, [filter, planFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setDueDate(null);
    setPlanId(undefined);
    setModalOpen(true);
  };

  const openEdit = (todo: Todo) => {
    setEditing(todo);
    setTitle(todo.title);
    setDueDate(todo.due_date ? dayjs(todo.due_date) : null);
    setPlanId(todo.plan_id ?? undefined);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      message.warning('请输入待办内容');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: trimmed,
        due_date: dueDate ? dueDate.format('YYYY-MM-DD') : null,
        plan_id: planId ?? null,
      };
      if (editing) {
        await todoApi.update(editing.id, payload);
      } else {
        await todoApi.create(payload);
      }
      message.success(editing ? '已保存' : '已添加');
      setModalOpen(false);
      load();
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (todo: Todo, done: boolean) => {
    try {
      await todoApi.update(todo.id, { done });
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, done } : t)));
    } catch {
      message.error('操作失败');
    }
  };

  const handleDelete = (todo: Todo) => {
    Modal.confirm({
      title: '删除待办',
      content: `确认删除 "${todo.title}"？`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await todoApi.delete(todo.id);
          message.success('已删除');
          load();
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  const dueColor = (d: string | null): string => {
    if (!d) return '#bbb';
    if (d < today) return '#c0392b';
    if (d === today) return '#e67e22';
    return '#999';
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(12px, 3vw, 24px)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>待办</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增待办
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as FilterKey)}
          options={[
            { label: '全部', value: 'all' },
            { label: '未完成', value: 'open' },
            { label: '已完成', value: 'done' },
          ]}
        />
        <Select
          allowClear
          placeholder="按计划筛选"
          style={{ minWidth: 160 }}
          value={planFilter}
          onChange={(v) => setPlanFilter(v)}
          options={plans.map((p) => ({ label: p.name, value: p.id }))}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin />
        </div>
      ) : todos.length === 0 ? (
        <Empty description="暂无待办" style={{ padding: 60 }} />
      ) : (
        <List
          dataSource={todos}
          renderItem={(todo) => (
            <List.Item
              style={{
                background: '#fff',
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: 8,
                border: '1px solid #f0f0f0',
              }}
              actions={[
                <Button
                  key="edit"
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(todo)}
                />,
                <Button
                  key="del"
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(todo)}
                />,
              ]}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', minWidth: 0 }}>
                <Checkbox
                  checked={todo.done}
                  onChange={(e) => handleToggle(todo, e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      textDecoration: todo.done ? 'line-through' : 'none',
                      color: todo.done ? '#bbb' : '#1a1a1a',
                      wordBreak: 'break-all',
                    }}
                  >
                    {todo.title}
                  </div>
                  <Space size={8} style={{ marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: dueColor(todo.due_date) }}>
                      {todo.due_date ? `截止 ${todo.due_date}` : '无截止日期'}
                    </span>
                    {todo.plan_name && <Tag style={{ marginInlineEnd: 0 }}>{todo.plan_name}</Tag>}
                  </Space>
                </div>
              </div>
            </List.Item>
          )}
        />
      )}

      <Modal
        title={editing ? '编辑待办' : '新增待办'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>内容 *</div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="要做点什么？"
            maxLength={200}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>截止日期</div>
          <DatePicker
            style={{ width: '100%' }}
            value={dueDate}
            onChange={(d) => setDueDate(d)}
            placeholder="不填表示无期限"
            allowClear
          />
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>关联计划</div>
          <Select
            style={{ width: '100%' }}
            allowClear
            placeholder="选择计划（可选）"
            value={planId}
            onChange={(v) => setPlanId(v)}
            options={plans.map((p) => ({ label: p.name, value: p.id }))}
          />
        </div>
      </Modal>
    </div>
  );
}
