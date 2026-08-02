import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  message,
} from 'antd';
import {
  BankOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { todoApi } from '../services/todoApi';
import { planApi } from '../services/planApi';
import type { Plan, Todo } from '../types/api';
import { buildTodoTree, filterTree, flattenTree, type TodoNode } from '../utils/todoTree';
import { todayStr } from '../utils/helpers';

type FilterKey = 'all' | 'open' | 'done';

export default function TodosPage() {
  const navigate = useNavigate();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [planFilter, setPlanFilter] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState<Dayjs | null>(null);
  const [planId, setPlanId] = useState<number | undefined>(undefined);
  const [parentId, setParentId] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const today = todayStr();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [todoData, planData] = await Promise.all([
        todoApi.list(),
        planApi.list({ archived: false }),
      ]);
      setTodos(todoData);
      setPlans(planData);
    } catch {
      message.error('加载待办失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fullTree = useMemo(() => buildTodoTree(todos), [todos]);

  const visibleTree = useMemo(() => {
    let tree = fullTree;
    if (filter === 'open') {
      tree = filterTree(tree, (n) => !n.done);
    } else if (filter === 'done') {
      tree = filterTree(tree, (n) => n.done);
    }
    if (planFilter !== undefined) {
      tree = filterTree(tree, (n) => n.plan_id === planFilter);
    }
    return tree;
  }, [fullTree, filter, planFilter]);

  // 按计划分组（含"未分组"）
  const grouped = useMemo(() => {
    const roots = visibleTree.filter((n) => !n.parent_id);
    const map = new Map<number | 'none', TodoNode[]>();
    roots.forEach((n) => {
      const key = n.plan_id ?? 'none';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    });
    const planNames = new Map(plans.map((p) => [p.id, p.name]));
    const entries: { key: string; label: string; nodes: TodoNode[] }[] = [];
    [...map.entries()]
      .sort((a, b) => {
        if (a[0] === 'none') return 1;
        if (b[0] === 'none') return -1;
        return String(a[0]).localeCompare(String(b[0]));
      })
      .forEach(([pid, nodes]) => {
        entries.push({
          key: String(pid),
          label: pid === 'none' ? '未分组' : planNames.get(pid as number) || `计划 #${pid}`,
          nodes,
        });
      });
    return entries;
  }, [visibleTree, plans]);

  const toggleCollapsed = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setDueDate(null);
    setPlanId(undefined);
    setParentId(undefined);
    setModalOpen(true);
  };

  const openEdit = (todo: Todo) => {
    setEditing(todo);
    setTitle(todo.title);
    setDueDate(todo.due_date ? dayjs(todo.due_date) : null);
    setPlanId(todo.plan_id ?? undefined);
    setParentId(todo.parent_id ?? undefined);
    setModalOpen(true);
  };

  // 上级待办候选：所选计划树中 depth <= 2 的节点（排除自身）
  const parentOptions = useMemo(() => {
    if (planId === undefined) return [];
    const tree = filterTree(fullTree, (n) => n.plan_id === planId);
    return flattenTree(tree)
      .filter((n) => n.depth <= 2 && n.id !== editing?.id)
      .map((n) => ({ label: `${'　'.repeat(n.depth - 1)}${n.title}`, value: n.id }));
  }, [planId, fullTree, editing]);

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
        parent_id: parentId ?? null,
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
      message.error('保存失败（可能是层级超过三级）');
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
      content: `确认删除 "${todo.title}"？其下级待办会一并删除。`,
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

  const renderNode = (node: TodoNode) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const allChildrenDone = hasChildren && node.children.every((c) => c.done);

    return (
      <div key={node.id}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '10px 12px',
            background: '#fff',
            borderRadius: 8,
            border: '1px solid #f0f0f0',
            marginBottom: 6,
          }}
        >
          <Button
            type="text"
            size="small"
            style={{ width: 24, padding: 0, flexShrink: 0, visibility: hasChildren ? 'visible' : 'hidden' }}
            icon={isCollapsed ? <RightOutlined /> : <DownOutlined />}
            onClick={() => toggleCollapsed(node.id)}
          />
          <Checkbox
            checked={node.done}
            onChange={(e) => handleToggle(node, e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                textDecoration: node.done ? 'line-through' : 'none',
                color: node.done ? '#bbb' : '#1a1a1a',
                wordBreak: 'break-all',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span>{node.title}</span>
              {node.deposit_plan_id && (
                <Button
                  type="text"
                  size="small"
                  icon={<BankOutlined />}
                  style={{ padding: 0, height: 'auto', color: '#1a1a2e' }}
                  onClick={() => navigate('/deposits')}
                  title="打开存款页"
                />
              )}
              {allChildrenDone && !node.done && (
                <Tag color="green" style={{ marginInlineEnd: 0 }}>
                  子待办已全部完成
                </Tag>
              )}
            </div>
            <Space size={8} style={{ marginTop: 2, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: dueColor(node.due_date) }}>
                {node.due_date ? `截止 ${node.due_date}` : '无截止日期'}
              </span>
              {node.plan_name && <Tag style={{ marginInlineEnd: 0 }}>{node.plan_name}</Tag>}
            </Space>
          </div>
          <Space style={{ flexShrink: 0 }}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(node)}
            />
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(node)}
            />
          </Space>
        </div>
        {hasChildren && !isCollapsed && (
          <div style={{ marginLeft: 32 }}>{node.children.map((c) => renderNode(c))}</div>
        )}
      </div>
    );
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
      ) : grouped.length === 0 ? (
        <Empty description="暂无待办" style={{ padding: 60 }} />
      ) : (
        grouped.map((group) => (
          <div key={group.key} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#666', marginBottom: 8 }}>
              {group.label}
            </div>
            {group.nodes.map((n) => renderNode(n))}
          </div>
        ))
      )}

      <Modal
        title={editing ? '编辑待办' : '新增待办'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        destroyOnHidden
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
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>关联计划</div>
          <Select
            style={{ width: '100%' }}
            allowClear
            placeholder="选择计划（可选）"
            value={planId}
            onChange={(v) => {
              setPlanId(v);
              setParentId(undefined);
            }}
            options={plans.map((p) => ({ label: p.name, value: p.id }))}
          />
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>上级待办（分级，最多三级）</div>
          <Select
            style={{ width: '100%' }}
            allowClear
            disabled={planId === undefined}
            placeholder={planId === undefined ? '请先选择关联计划' : '选择上级待办（可选）'}
            value={parentId}
            onChange={(v) => setParentId(v)}
            options={parentOptions}
          />
          {planId === undefined && (
            <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
              分级待办需要先选择所属计划
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
