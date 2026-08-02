import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Collapse,
  Col,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Segmented,
  Spin,
  Tag,
  message,
} from 'antd';
import {
  InboxOutlined,
  DeleteOutlined,
  EditOutlined,
  FlagOutlined,
  PlusOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { planApi } from '../services/planApi';
import { todoApi } from '../services/todoApi';
import type { Plan, Todo } from '../types/api';
import { buildTodoTree, type TodoNode } from '../utils/todoTree';

type Section = 'active' | 'archived';

export default function PlansPage() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>('active');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // 归档回顾：planId -> todos
  const [planTodos, setPlanTodos] = useState<Record<number, Todo[]>>({});

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [name, setName] = useState('');
  const [deadline, setDeadline] = useState<Dayjs | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [expandedTodos, setExpandedTodos] = useState<Record<number, Todo[]>>({});
  const [treeCollapsed, setTreeCollapsed] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await planApi.list({ archived: section === 'archived' });
      setPlans(data);
    } catch {
      message.error('加载计划失败');
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDeadline(null);
    setProgress(0);
    setModalOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setName(plan.name);
    setDeadline(plan.deadline ? dayjs(plan.deadline) : null);
    setProgress(plan.progress);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      message.warning('请输入计划名称');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: trimmed,
        deadline: deadline ? deadline.format('YYYY-MM-DD') : null,
        progress,
      };
      if (editing) {
        await planApi.update(editing.id, payload);
      } else {
        await planApi.create(payload);
      }
      message.success(editing ? '已保存' : '已创建');
      setModalOpen(false);
      load();
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = (plan: Plan) => {
    Modal.confirm({
      title: '归档计划',
      content: `确认归档 "${plan.name}"？归档后可在"已归档"中回顾。`,
      okText: '归档',
      cancelText: '取消',
      onOk: async () => {
        try {
          await planApi.update(plan.id, { archived: true });
          message.success('已归档');
          load();
        } catch {
          message.error('归档失败');
        }
      },
    });
  };

  const handleDelete = (plan: Plan) => {
    Modal.confirm({
      title: '删除计划',
      content: `确认删除 "${plan.name}"？关联待办不会被删除。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await planApi.delete(plan.id);
          message.success('已删除');
          load();
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  const loadPlanTodos = async (plan: Plan) => {
    if (planTodos[plan.id]) return;
    try {
      const todos = await todoApi.list({ plan_id: plan.id });
      setPlanTodos((prev) => ({ ...prev, [plan.id]: todos }));
    } catch {
      message.error('加载关联待办失败');
    }
  };

  const toggleExpand = async (plan: Plan) => {
    if (expandedTodos[plan.id]) {
      setExpandedTodos((prev) => {
        const next = { ...prev };
        delete next[plan.id];
        return next;
      });
      return;
    }
    try {
      const todos = await todoApi.list({ plan_id: plan.id });
      setExpandedTodos((prev) => ({ ...prev, [plan.id]: todos }));
    } catch {
      message.error('加载任务失败');
    }
  };

  const toggleTreeNode = (id: number) => {
    setTreeCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTree = (nodes: TodoNode[]) => {
    return nodes.map((n) => {
      const hasChildren = n.children.length > 0;
      const isCollapsed = treeCollapsed.has(n.id);
      return (
        <div key={n.id}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 8px',
              borderRadius: 6,
              background: '#fafafa',
              border: '1px solid #f0f0f0',
              marginBottom: 4,
            }}
          >
            <Button
              type="text"
              size="small"
              style={{ width: 20, padding: 0, visibility: hasChildren ? 'visible' : 'hidden' }}
              icon={isCollapsed ? <RightOutlined /> : <DownOutlined />}
              onClick={() => toggleTreeNode(n.id)}
            />
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                background: n.done ? '#1a1a2e' : '#fff',
                border: '1px solid #ccc',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 10,
              }}
            >
              {n.done ? '✓' : ''}
            </span>
            <span
              style={{
                fontSize: 14,
                textDecoration: n.done ? 'line-through' : 'none',
                color: n.done ? '#bbb' : '#333',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {n.title}
            </span>
            {n.children.length > 0 && !n.done && n.children.every((c) => c.done) && (
              <Tag color="green" style={{ marginInlineEnd: 0, fontSize: 11 }}>
                子待办已全部完成
              </Tag>
            )}
            <span style={{ fontSize: 12, color: '#aaa', flexShrink: 0 }}>
              {n.due_date ? n.due_date : ''}
            </span>
          </div>
          {hasChildren && !isCollapsed && (
            <div style={{ marginLeft: 28 }}>{renderTree(n.children)}</div>
          )}
        </div>
      );
    });
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
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>计划</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Segmented
            value={section}
            onChange={(v) => setSection(v as Section)}
            options={[
              { label: '进行中', value: 'active' },
              { label: '已归档', value: 'archived' },
            ]}
          />
          {section === 'active' && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建计划
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin />
        </div>
      ) : plans.length === 0 ? (
        <Empty description={section === 'active' ? '暂无进行中的计划' : '暂无已归档的计划'} style={{ padding: 60 }} />
      ) : section === 'active' ? (
        <Row gutter={[16, 16]}>
          {plans.map((plan) => (
            <Col xs={24} md={12} key={plan.id}>
              <Card>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <FlagOutlined style={{ color: '#1a1a2e' }} />
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {plan.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openEdit(plan)}
                    />
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDelete(plan)}
                    />
                  </div>
                </div>

                <div style={{ fontSize: 13, color: '#999', margin: '8px 0 12px' }}>
                  {plan.deadline ? `截止 ${plan.deadline}` : '无截止日期'}
                  {plan.total_count > 0 && (
                    <Tag style={{ marginLeft: 8 }} color="default">
                      {plan.done_count}/{plan.total_count} 项待办
                    </Tag>
                  )}
                  {plan.expense_total > 0 && (
                    <Tag style={{ marginLeft: 8 }} color="blue">
                      关联支出 ¥{plan.expense_total.toFixed(2)}
                    </Tag>
                  )}
                </div>

                <Progress percent={plan.progress} strokeColor="#1a1a2e" />

                {plan.total_count === 0 && plan.progress > 0 && (
                  <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>手动进度</div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <Button
                    style={{ flex: 1 }}
                    icon={<InboxOutlined />}
                    onClick={() => handleArchive(plan)}
                  >
                    归档
                  </Button>
                  <Button
                    style={{ flex: 1 }}
                    onClick={() =>
                      navigate(`/expenses?plan_id=${plan.id}&note=${encodeURIComponent(plan.name)}`)
                    }
                  >
                    记一笔
                  </Button>
                </div>

                <div style={{ marginTop: 12 }}>
                  <Button
                    type="text"
                    size="small"
                    block
                    onClick={() => toggleExpand(plan)}
                    style={{ color: '#666' }}
                  >
                    {expandedTodos[plan.id] ? '收起任务' : '展开任务'}
                  </Button>
                  {expandedTodos[plan.id] && (
                    <div style={{ marginTop: 8 }}>
                      {buildTodoTree(expandedTodos[plan.id]).length === 0 ? (
                        <div style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: 8 }}>
                          暂无待办
                        </div>
                      ) : (
                        renderTree(buildTodoTree(expandedTodos[plan.id]))
                      )}
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Collapse
          items={plans.map((plan) => ({
            key: String(plan.id),
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600 }}>{plan.name}</span>
                <span style={{ fontSize: 12, color: '#999' }}>
                  {plan.deadline ? `截止 ${plan.deadline}` : '无截止日期'} · 进度 {plan.progress}%
                </span>
              </div>
            ),
            children: (
              <div>
                <Progress percent={plan.progress} strokeColor="#1a1a2e" style={{ marginBottom: 12 }} />
                <div
                  style={{ fontSize: 13, color: '#666', marginBottom: 8 }}
                  onClick={() => loadPlanTodos(plan)}
                >
                  关联待办（{plan.done_count}/{plan.total_count}）
                </div>
                {planTodos[plan.id] ? (
                  planTodos[plan.id].length === 0 ? (
                    <div style={{ fontSize: 13, color: '#aaa' }}>此计划下没有待办</div>
                  ) : (
                    planTodos[plan.id].map((t) => (
                      <div
                        key={t.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 0',
                          borderBottom: '1px solid #f5f5f5',
                          fontSize: 14,
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 3,
                            background: t.done ? '#1a1a2e' : '#fff',
                            border: '1px solid #ccc',
                            flexShrink: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: 10,
                          }}
                        >
                          {t.done ? '✓' : ''}
                        </span>
                        <span
                          style={{
                            textDecoration: t.done ? 'line-through' : 'none',
                            color: t.done ? '#bbb' : '#333',
                            flex: 1,
                          }}
                        >
                          {t.title}
                        </span>
                        <span style={{ fontSize: 12, color: '#aaa' }}>
                          {t.due_date ? t.due_date : ''}
                        </span>
                      </div>
                    ))
                  )
                ) : (
                  <div style={{ fontSize: 13, color: '#aaa' }}>点击上方加载关联待办</div>
                )}
              </div>
            ),
          }))}
        />
      )}

      <Modal
        title={editing ? '编辑计划' : '新建计划'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>名称 *</div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：年底存 2 万"
            maxLength={100}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>截止日期</div>
          <DatePicker
            style={{ width: '100%' }}
            value={deadline}
            onChange={(d) => setDeadline(d)}
            placeholder="不填表示无期限"
            allowClear
          />
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>进度（0-100%）</div>
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            max={100}
            value={progress}
            onChange={(v) => setProgress(v ?? 0)}
            disabled={!!editing && editing.total_count > 0}
          />
          {!!editing && editing.total_count > 0 && (
            <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
              该计划已关联待办，进度将按待办完成情况自动计算
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
