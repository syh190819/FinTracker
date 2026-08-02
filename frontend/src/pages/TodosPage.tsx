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
  FlagOutlined,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useLocation, useNavigate } from 'react-router-dom';
import { todoApi } from '../services/todoApi';
import { planApi } from '../services/planApi';
import { depositApi } from '../services/depositApi';
import type { Plan, PlanWithBalance, Todo } from '../types/api';
import { buildTodoTree, filterTree, type TodoNode } from '../utils/todoTree';
import { formatMoney, todayStr } from '../utils/helpers';

type FilterKey = 'all' | 'open' | 'done';

export default function TodosPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [archivedPlans, setArchivedPlans] = useState<Plan[]>([]);
  const [depositPlans, setDepositPlans] = useState<PlanWithBalance[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [planTrees, setPlanTrees] = useState<Record<number, Todo[]>>({});
  const [archivedOpen, setArchivedOpen] = useState(false);

  // 待办弹窗
  const [todoModalOpen, setTodoModalOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [todoTitle, setTodoTitle] = useState('');
  const [todoDue, setTodoDue] = useState<Dayjs | null>(null);
  const [todoPlanId, setTodoPlanId] = useState<number | undefined>(undefined);
  const [todoParent, setTodoParent] = useState<Todo | null>(null);
  const [savingTodo, setSavingTodo] = useState(false);

  // 计划弹窗
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planName, setPlanName] = useState('');
  const [planDeadline, setPlanDeadline] = useState<Dayjs | null>(null);
  const [planProgress, setPlanProgress] = useState(0);
  const [savingPlan, setSavingPlan] = useState(false);

  const today = todayStr();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [todoData, planData, archivedData, depositData] = await Promise.all([
        todoApi.list(),
        planApi.list({ archived: false }),
        planApi.list({ archived: true }),
        depositApi.listPlans(),
      ]);
      setTodos(todoData);
      setPlans(planData);
      setArchivedPlans(archivedData);
      setDepositPlans(depositData);
    } catch {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 工作台"新建计划"快捷入口
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('newPlan')) {
      openPlanCreate();
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const fullTree = useMemo(() => buildTodoTree(todos), [todos]);

  const visibleTree = useMemo(() => {
    if (filter === 'open') return filterTree(fullTree, (n) => !n.done);
    if (filter === 'done') return filterTree(fullTree, (n) => n.done);
    return fullTree;
  }, [fullTree, filter]);

  const loadPlanTree = async (planId: number) => {
    if (planTrees[planId]) return;
    try {
      const data = await todoApi.list({ plan_id: planId });
      setPlanTrees((prev) => ({ ...prev, [planId]: data }));
    } catch {
      message.error('加载任务失败');
    }
  };

  const togglePlanTree = async (planId: number) => {
    if (planTrees[planId]) {
      setPlanTrees((prev) => {
        const next = { ...prev };
        delete next[planId];
        return next;
      });
      return;
    }
    await loadPlanTree(planId);
  };

  const toggleCollapsed = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── 待办弹窗 ──
  const openTodoCreate = (planId?: number, parent?: Todo | null) => {
    setEditingTodo(null);
    setTodoTitle('');
    setTodoDue(null);
    setTodoPlanId(planId);
    setTodoParent(parent ?? null);
    setTodoModalOpen(true);
  };

  const openTodoEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setTodoTitle(todo.title);
    setTodoDue(todo.due_date ? dayjs(todo.due_date) : null);
    setTodoPlanId(todo.plan_id ?? undefined);
    setTodoParent(todos.find((t) => t.id === todo.parent_id) ?? null);
    setTodoModalOpen(true);
  };

  const handleTodoSave = async () => {
    const trimmed = todoTitle.trim();
    if (!trimmed) {
      message.warning('请输入待办内容');
      return;
    }
    setSavingTodo(true);
    try {
      const payload = {
        title: trimmed,
        due_date: todoDue ? todoDue.format('YYYY-MM-DD') : null,
        plan_id: todoPlanId ?? null,
        parent_id: todoParent?.id ?? null,
      };
      if (editingTodo) {
        await todoApi.update(editingTodo.id, payload);
      } else {
        await todoApi.create(payload);
      }
      message.success(editingTodo ? '已保存' : '已添加');
      setTodoModalOpen(false);
      load();
    } catch {
      message.error('保存失败（层级超过三级？）');
    } finally {
      setSavingTodo(false);
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

  const handleTodoDelete = (todo: Todo) => {
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

  // ── 计划弹窗 ──
  const openPlanCreate = () => {
    setEditingPlan(null);
    setPlanName('');
    setPlanDeadline(null);
    setPlanProgress(0);
    setPlanModalOpen(true);
  };

  const openPlanEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setPlanName(plan.name);
    setPlanDeadline(plan.deadline ? dayjs(plan.deadline) : null);
    setPlanProgress(plan.progress);
    setPlanModalOpen(true);
  };

  const handlePlanSave = async () => {
    const trimmed = planName.trim();
    if (!trimmed) {
      message.warning('请输入计划名称');
      return;
    }
    setSavingPlan(true);
    try {
      const payload = {
        name: trimmed,
        deadline: planDeadline ? planDeadline.format('YYYY-MM-DD') : null,
        progress: planProgress,
      };
      if (editingPlan) {
        await planApi.update(editingPlan.id, payload);
      } else {
        await planApi.create(payload);
      }
      message.success(editingPlan ? '已保存' : '已创建');
      setPlanModalOpen(false);
      load();
    } catch {
      message.error('保存失败');
    } finally {
      setSavingPlan(false);
    }
  };

  const handlePlanArchive = (plan: Plan) => {
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

  const handlePlanDelete = (plan: Plan) => {
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

  const dueColor = (d: string | null): string => {
    if (!d) return '#bbb';
    if (d < today) return '#c0392b';
    if (d === today) return '#e67e22';
    return '#999';
  };

  const renderTree = (nodes: TodoNode[]) => {
    return nodes.map((node) => {
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
              padding: '9px 12px',
              background: '#fff',
              borderRadius: 8,
              border: '1px solid #f0f0f0',
              marginBottom: 6,
            }}
          >
            <Button
              type="text"
              size="small"
              style={{ width: 22, padding: 0, flexShrink: 0, visibility: hasChildren ? 'visible' : 'hidden' }}
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
                icon={<PlusOutlined />}
                disabled={node.depth >= 3}
                onClick={() => openTodoCreate(node.plan_id ?? undefined, node)}
                title={node.depth >= 3 ? '已达最大层级' : '添加子级待办'}
              />
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => openTodoEdit(node)}
              />
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleTodoDelete(node)}
              />
            </Space>
          </div>
          {hasChildren && !isCollapsed && (
            <div style={{ marginLeft: 32 }}>{renderTree(node.children)}</div>
          )}
        </div>
      );
    });
  };

  const planNodes = (planId: number) =>
    visibleTree.filter((n) => !n.parent_id && n.plan_id === planId);

  const ungroupedNodes = visibleTree.filter((n) => !n.parent_id && !n.plan_id);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(12px, 3vw, 24px)' }}>
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
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>待办与计划</h1>
        <Space wrap>
          <Button icon={<FlagOutlined />} onClick={openPlanCreate}>
            新建计划
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openTodoCreate()}>
            新建待办
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as FilterKey)}
          options={[
            { label: '全部', value: 'all' },
            { label: '未完成', value: 'open' },
            { label: '已完成', value: 'done' },
          ]}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin />
        </div>
      ) : (
        <>
          {/* 存款计划 */}
          {depositPlans.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#666', marginBottom: 8 }}>
                存款计划
              </div>
              {depositPlans.map((d) => (
                <div
                  key={d.plan.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    background: '#fff',
                    borderRadius: 8,
                    border: '1px solid #f0f0f0',
                    marginBottom: 6,
                    flexWrap: 'wrap',
                  }}
                >
                  <BankOutlined style={{ color: '#1a1a2e', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, flexShrink: 0 }}>{d.plan.name}</span>
                  <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>
                    存款计划
                  </Tag>
                  {d.plan.auto_todo_enabled && (
                    <Tag style={{ marginInlineEnd: 0 }}>
                      每月 {d.plan.auto_todo_day} 号提醒
                    </Tag>
                  )}
                  <span style={{ fontSize: 12, color: '#999', flex: 1, minWidth: 120 }}>
                    月目标 {formatMoney(d.plan.monthly_goal)} · 余额 {formatMoney(d.balance)}
                  </span>
                  <Button size="small" onClick={() => navigate('/deposits')}>
                    去管理
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* 计划分组 */}
          {plans.map((plan) => {
            const nodes = planNodes(plan.id);
            const tree = planTrees[plan.id];
            return (
              <div key={plan.id} style={{ marginBottom: 24 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    background: '#fff',
                    borderRadius: 8,
                    border: '1px solid #e8e8e8',
                    marginBottom: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <FlagOutlined style={{ color: '#1a1a2e' }} />
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{plan.name}</span>
                  {plan.deadline && (
                    <span style={{ fontSize: 12, color: '#999' }}>截止 {plan.deadline}</span>
                  )}
                  {plan.expense_total > 0 && (
                    <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                      关联支出 ¥{plan.expense_total.toFixed(2)}
                    </Tag>
                  )}
                  <div style={{ flex: 1, minWidth: 120, maxWidth: 220 }}>
                    <Progress
                      percent={plan.progress}
                      size="small"
                      strokeColor="#1a1a2e"
                      format={(p) => `${p}%`}
                    />
                  </div>
                  <Space wrap style={{ flexShrink: 0 }}>
                    <Button size="small" icon={<PlusOutlined />} onClick={() => openTodoCreate(plan.id)}>
                      添加待办
                    </Button>
                    <Button
                      size="small"
                      onClick={() =>
                        navigate(`/expenses?plan_id=${plan.id}&note=${encodeURIComponent(plan.name)}`)
                      }
                    >
                      记一笔
                    </Button>
                    <Button size="small" onClick={() => togglePlanTree(plan.id)}>
                      {tree ? '收起任务' : '展开任务'}
                    </Button>
                    <Button size="small" onClick={() => openPlanEdit(plan)}>
                      编辑
                    </Button>
                    <Button size="small" onClick={() => handlePlanArchive(plan)}>
                      归档
                    </Button>
                    <Button size="small" danger onClick={() => handlePlanDelete(plan)}>
                      删除
                    </Button>
                  </Space>
                </div>

                {tree ? (
                  <div style={{ marginTop: 8 }}>
                    {buildTodoTree(tree).length === 0 ? (
                      <div style={{ fontSize: 13, color: '#aaa', padding: 8 }}>暂无任务</div>
                    ) : (
                      renderTree(buildTodoTree(tree))
                    )}
                  </div>
                ) : nodes.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#aaa', padding: '4px 8px' }}>
                    暂无待办，点"添加待办"开始
                  </div>
                ) : (
                  nodes.map((n) => renderTree([n]))
                )}
              </div>
            );
          })}

          {/* 未分组待办 */}
          {ungroupedNodes.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#666', marginBottom: 8 }}>
                未分组待办
              </div>
              {renderTree(ungroupedNodes)}
            </div>
          )}

          {/* 已归档计划 */}
          {archivedPlans.length > 0 && (
            <div>
              <Button
                type="text"
                size="small"
                onClick={() => setArchivedOpen((v) => !v)}
                icon={archivedOpen ? <DownOutlined /> : <RightOutlined />}
                style={{ color: '#666' }}
              >
                已归档计划（{archivedPlans.length}）
              </Button>
              {archivedOpen &&
                archivedPlans.map((plan) => (
                  <div
                    key={plan.id}
                    style={{
                      padding: '10px 14px',
                      background: '#fafafa',
                      borderRadius: 8,
                      border: '1px solid #f0f0f0',
                      marginTop: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>{plan.name}</span>
                      <Tag style={{ marginInlineEnd: 0 }}>已归档</Tag>
                      <span style={{ fontSize: 12, color: '#999' }}>
                        进度 {plan.progress}%{plan.expense_total > 0 ? ` · 关联支出 ¥${plan.expense_total.toFixed(2)}` : ''}
                      </span>
                      <Button size="small" onClick={() => loadPlanTree(plan.id)}>
                        {planTrees[plan.id] ? '收起任务' : '展开回顾'}
                      </Button>
                    </div>
                    {planTrees[plan.id] && (
                      <div style={{ marginTop: 8 }}>
                        {buildTodoTree(planTrees[plan.id]).length === 0 ? (
                          <div style={{ fontSize: 13, color: '#aaa', padding: 8 }}>无关联待办</div>
                        ) : (
                          renderTree(buildTodoTree(planTrees[plan.id]))
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {plans.length === 0 &&
            depositPlans.length === 0 &&
            ungroupedNodes.length === 0 &&
            archivedPlans.length === 0 && (
              <Empty description="暂无内容，新建一个计划或待办吧" style={{ padding: 60 }} />
            )}
        </>
      )}

      {/* 待办弹窗 */}
      <Modal
        title={editingTodo ? '编辑待办' : '新增待办'}
        open={todoModalOpen}
        onOk={handleTodoSave}
        onCancel={() => setTodoModalOpen(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={savingTodo}
        destroyOnHidden
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>内容 *</div>
          <Input
            value={todoTitle}
            onChange={(e) => setTodoTitle(e.target.value)}
            placeholder="要做点什么？"
            maxLength={200}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>截止日期</div>
          <DatePicker
            style={{ width: '100%' }}
            value={todoDue}
            onChange={(d) => setTodoDue(d)}
            placeholder="不填表示无期限"
            allowClear
          />
        </div>
        {todoParent && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>上级待办</div>
            <div
              style={{
                padding: '8px 12px',
                background: '#fafafa',
                borderRadius: 6,
                fontSize: 13,
                color: '#555',
              }}
            >
              {todoParent.title}
            </div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>关联计划</div>
          <Select
            style={{ width: '100%' }}
            allowClear
            disabled={!!todoParent}
            placeholder={todoParent ? '继承上级待办的计划' : '选择计划（可选）'}
            value={todoPlanId}
            onChange={(v) => setTodoPlanId(v)}
            options={plans.map((p) => ({ label: p.name, value: p.id }))}
          />
        </div>
      </Modal>

      {/* 计划弹窗 */}
      <Modal
        title={editingPlan ? '编辑计划' : '新建计划'}
        open={planModalOpen}
        onOk={handlePlanSave}
        onCancel={() => setPlanModalOpen(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={savingPlan}
        destroyOnHidden
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>名称 *</div>
          <Input
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder="如：年底存 2 万"
            maxLength={100}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>截止日期</div>
          <DatePicker
            style={{ width: '100%' }}
            value={planDeadline}
            onChange={(d) => setPlanDeadline(d)}
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
            value={planProgress}
            onChange={(v) => setPlanProgress(v ?? 0)}
            disabled={!!editingPlan && editingPlan.total_count > 0}
          />
          {!!editingPlan && editingPlan.total_count > 0 && (
            <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
              该计划已有待办，进度按待办完成情况自动计算
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
