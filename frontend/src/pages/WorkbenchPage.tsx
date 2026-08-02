import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Col, Empty, Popover, Progress, Row, Select, Spin, message } from 'antd';
import {
  PlusOutlined,
  CheckSquareOutlined,
  FlagOutlined,
  RightOutlined,
  BankOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, PieChart, Pie, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { workbenchApi } from '../services/workbenchApi';
import { statisticsApi } from '../services/statisticsApi';
import type { BudgetVsActual, CategoryTotal, MonthlyTotal, WorkbenchSummary } from '../types/api';
import { formatMoney } from '../utils/helpers';

const COLORS = ['#1a1a2e', '#27ae60', '#c0392b', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22'];

export default function WorkbenchPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<WorkbenchSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [fabOpen, setFabOpen] = useState(false);

  const year = new Date().getFullYear();
  const [trendYear, setTrendYear] = useState(year);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthlyData, setMonthlyData] = useState<MonthlyTotal[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryTotal[]>([]);
  const [budgetData, setBudgetData] = useState<BudgetVsActual[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await workbenchApi.summary());
    } catch {
      message.error('加载工作台失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    statisticsApi.monthly(trendYear).then(setMonthlyData).catch(() => {});
  }, [trendYear]);

  useEffect(() => {
    statisticsApi.category(month).then(setCategoryData).catch(() => {});
    statisticsApi.budgetVsActual(month).then(setBudgetData).catch(() => {});
  }, [month]);

  const budgetPercent =
    summary && summary.month_budget > 0
      ? Math.min(100, Math.round((summary.month_personal / summary.month_budget) * 100))
      : 0;

  const closeFab = (fn: () => void) => () => { setFabOpen(false); fn(); };

  const fabContent = (
    <div style={{ width: 210 }}>
      {/* 计划（样式区分：独立强调区） */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: '#1a1a2e',
          marginBottom: 8,
        }}
      >
        <FlagOutlined /> 计划
      </div>
      <Button
        type="primary"
        block
        icon={<PlusOutlined />}
        style={{ marginBottom: 12 }}
        onClick={closeFab(() => navigate('/plans'))}
      >
        新建计划
      </Button>
      <div style={{ borderTop: '1px solid #e8e8e8', marginBottom: 10 }} />
      <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>快速记录</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Button block icon={<WalletOutlined />} onClick={closeFab(() => navigate('/expenses?type=income'))}>
          记收入
        </Button>
        <Button block icon={<WalletOutlined />} onClick={closeFab(() => navigate('/expenses?type=expense'))}>
          记支出
        </Button>
        <Button block icon={<CheckSquareOutlined />} onClick={closeFab(() => navigate('/todos'))}>
          新增待办
        </Button>
        <Button block icon={<BankOutlined />} onClick={closeFab(() => navigate('/deposits'))}>
          存入存款
        </Button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(12px, 3vw, 24px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>工作台</h1>
        <Button size="small" onClick={load} loading={loading}>刷新</Button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 80 }}><Spin /></div>}
      {!loading && !summary && <Empty description="加载失败，请刷新重试" style={{ padding: 60 }} />}

      {summary && (
        <>
          <Row gutter={[16, 16]}>
            {/* 本月收入 */}
            <Col xs={24} md={12} lg={8}>
              <Card>
                <div style={{ fontSize: 14, color: '#888' }}>本月收入</div>
                <div style={{ fontSize: 30, fontWeight: 700, margin: '8px 0 4px', color: '#1e8449' }}>
                  {formatMoney(summary.month_income)}
                </div>
                <div style={{ fontSize: 13, color: '#999' }}>
                  个人 {formatMoney(summary.month_income_personal)} · 共享 {formatMoney(summary.month_income_shared)}
                </div>
              </Card>
            </Col>

            {/* 本月支出 */}
            <Col xs={24} md={12} lg={8}>
              <Card>
                <div style={{ fontSize: 14, color: '#888' }}>本月支出</div>
                <div style={{ fontSize: 30, fontWeight: 700, margin: '8px 0 4px' }}>
                  {formatMoney(summary.month_total)}
                </div>
                <div style={{ fontSize: 13, color: '#999', marginBottom: 8 }}>
                  个人 {formatMoney(summary.month_personal)} · 共享 {formatMoney(summary.month_shared)}
                </div>
                <div style={{ fontSize: 13, color: '#999', marginBottom: 8 }}>
                  个人支出 / 预算 {formatMoney(summary.month_budget)}
                </div>
                <Progress percent={budgetPercent} strokeColor={budgetPercent > 100 ? '#c0392b' : '#1a1a2e'} size="small" />
              </Card>
            </Col>

            {/* 待办概览 */}
            <Col xs={24} md={12} lg={8}>
              <Card>
                <div style={{ fontSize: 14, color: '#888' }}>待办事项</div>
                <div style={{ fontSize: 30, fontWeight: 700, margin: '8px 0 4px' }}>
                  {summary.open_todo_count}
                  <span style={{ fontSize: 14, fontWeight: 400, color: '#999' }}> 项未完成</span>
                </div>
                <div style={{ fontSize: 13, color: '#c0392b', marginBottom: 10 }}>
                  今天到期 {summary.today_todo_count} 项
                </div>
                {summary.recent_todos.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#aaa', padding: '6px 0' }}>暂无待办，轻松一下</div>
                ) : (
                  summary.recent_todos.slice(0, 3).map((t) => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, overflow: 'hidden', cursor: t.deposit_plan_id ? 'pointer' : 'default' }} onClick={() => t.deposit_plan_id && navigate('/deposits')}>
                      {t.deposit_plan_id ? <BankOutlined style={{ color: '#1a1a2e', flexShrink: 0 }} /> : <CheckSquareOutlined style={{ color: '#1a1a2e', flexShrink: 0 }} />}
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                      <span style={{ color: '#aaa', flexShrink: 0 }}>{t.due_date ? t.due_date.slice(5) : ''}</span>
                    </div>
                  ))
                )}
                <Button type="link" size="small" style={{ padding: 0, marginTop: 6 }} onClick={() => navigate('/todos')}>
                  去处理 <RightOutlined />
                </Button>
              </Card>
            </Col>

            {/* 计划概览 */}
            <Col xs={24}>
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 14, color: '#888' }}>
                    进行中计划 {summary.active_plan_count} 个
                  </div>
                  <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate('/plans')}>
                    查看全部 <RightOutlined />
                  </Button>
                </div>
                {summary.active_plans.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#aaa', padding: '6px 0' }}>暂无进行中的计划</div>
                ) : (
                  <Row gutter={[16, 12]}>
                    {summary.active_plans.slice(0, 6).map((p) => (
                      <Col xs={24} md={12} lg={8} key={p.id}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                            <span style={{ color: '#999', flexShrink: 0, marginLeft: 8 }}>{p.done_count}/{p.total_count}</span>
                          </div>
                          <Progress percent={p.progress} size="small" strokeColor="#1a1a2e" />
                        </div>
                      </Col>
                    ))}
                  </Row>
                )}
              </Card>
            </Col>
          </Row>

          {/* 统计图表 */}
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24}>
              <Card title="月度支出趋势">
                <div style={{ marginBottom: 12 }}>
                  <Select value={trendYear} onChange={setTrendYear} style={{ width: 120 }} options={Array.from({ length: 10 }, (_, i) => year - 5 + i).map((y) => ({ label: `${y}年`, value: y }))} />
                </div>
                {monthlyData.length === 0 ? (
                  <Empty description="暂无趋势数据" style={{ padding: 30 }} />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tickFormatter={(v: string) => v.slice(5)} tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(v: number) => `¥${v}`} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value) => [formatMoney(Number(value)), '支出']} />
                      <Line type="monotone" dataKey="total" stroke="#3498db" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="分类支出分布">
                <div style={{ marginBottom: 12 }}>
                  <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13 }} />
                </div>
                {categoryData.length === 0 ? (
                  <Empty description="暂无数据" style={{ padding: 30 }} />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={categoryData} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                        {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(value) => [formatMoney(Number(value)), '支出']} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="预算 vs 实际">
                <div style={{ marginBottom: 12 }}>
                  <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13 }} />
                </div>
                {budgetData.length === 0 ? (
                  <Empty description="暂无数据" style={{ padding: 30 }} />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={budgetData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value, name) => [formatMoney(Number(value)), String(name) === 'budget' ? '预算' : '实际']} />
                      <Legend formatter={(v: string) => (v === 'budget' ? '预算' : '实际')} />
                      <Bar dataKey="budget" fill="#3498db" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="actual" fill="#e74c3c" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* 悬浮 FAB */}
      <Popover
        content={fabContent}
        trigger="click"
        placement="topRight"
        open={fabOpen}
        onOpenChange={setFabOpen}
      >
        <Button
          type="primary"
          shape="circle"
          size="large"
          icon={<PlusOutlined />}
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            width: 56,
            height: 56,
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            zIndex: 100,
          }}
        />
      </Popover>
    </div>
  );
}
