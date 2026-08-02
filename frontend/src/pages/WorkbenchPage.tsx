import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Col, Empty, Progress, Row, Spin, message } from 'antd';
import {
  PlusOutlined,
  CheckSquareOutlined,
  FlagOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { workbenchApi } from '../services/workbenchApi';
import type { WorkbenchSummary } from '../types/api';
import { formatMoney } from '../utils/helpers';

export default function WorkbenchPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<WorkbenchSummary | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    load();
  }, [load]);

  const budgetPercent =
    summary && summary.month_budget > 0
      ? Math.min(100, Math.round((summary.month_personal / summary.month_budget) * 100))
      : 0;

  const quickActionStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 120,
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(12px, 3vw, 24px)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>工作台</h1>
        <Button size="small" onClick={load} loading={loading}>
          刷新
        </Button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin />
        </div>
      )}

      {!loading && !summary && (
        <Empty description="加载失败，请刷新重试" style={{ padding: 60 }} />
      )}

      {summary && (
        <>
          <Row gutter={[16, 16]}>
            {/* 本月支出 */}
            <Col xs={24} md={12} lg={8}>
              <Card>
                <div style={{ fontSize: 14, color: '#888' }}>本月支出</div>
                <div style={{ fontSize: 30, fontWeight: 700, margin: '8px 0 4px' }}>
                  {formatMoney(summary.month_total)}
                </div>
                <div style={{ fontSize: 13, color: '#999', marginBottom: 8 }}>
                  个人 {formatMoney(summary.month_personal)} · 共享{' '}
                  {formatMoney(summary.month_shared)}
                </div>
                <div style={{ fontSize: 13, color: '#999', marginBottom: 8 }}>
                  个人支出 / 预算 {formatMoney(summary.month_budget)}
                </div>
                <Progress
                  percent={budgetPercent}
                  strokeColor={budgetPercent > 100 ? '#c0392b' : '#1a1a2e'}
                  size="small"
                />
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
                  <div style={{ fontSize: 13, color: '#aaa', padding: '6px 0' }}>
                    暂无待办，轻松一下
                  </div>
                ) : (
                  summary.recent_todos.slice(0, 3).map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '5px 0',
                        fontSize: 13,
                        overflow: 'hidden',
                      }}
                    >
                      <CheckSquareOutlined style={{ color: '#1a1a2e', flexShrink: 0 }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.title}
                      </span>
                      <span style={{ color: '#aaa', flexShrink: 0 }}>
                        {t.due_date ? t.due_date.slice(5) : ''}
                      </span>
                    </div>
                  ))
                )}
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, marginTop: 6 }}
                  onClick={() => navigate('/todos')}
                >
                  去处理 <RightOutlined />
                </Button>
              </Card>
            </Col>

            {/* 计划概览 */}
            <Col xs={24} md={12} lg={8}>
              <Card>
                <div style={{ fontSize: 14, color: '#888' }}>进行中计划</div>
                <div style={{ fontSize: 30, fontWeight: 700, margin: '8px 0 4px' }}>
                  {summary.active_plan_count}
                  <span style={{ fontSize: 14, fontWeight: 400, color: '#999' }}> 个</span>
                </div>
                <div style={{ marginBottom: 10 }} />
                {summary.active_plans.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#aaa', padding: '6px 0' }}>
                    暂无进行中的计划
                  </div>
                ) : (
                  summary.active_plans.slice(0, 3).map((p) => (
                    <div key={p.id} style={{ marginBottom: 8 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 13,
                          marginBottom: 2,
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </span>
                        <span style={{ color: '#999', flexShrink: 0, marginLeft: 8 }}>
                          {p.done_count}/{p.total_count}
                        </span>
                      </div>
                      <Progress percent={p.progress} size="small" strokeColor="#1a1a2e" />
                    </div>
                  ))
                )}
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, marginTop: 6 }}
                  onClick={() => navigate('/plans')}
                >
                  查看全部 <RightOutlined />
                </Button>
              </Card>
            </Col>
          </Row>

          {/* 快速操作 */}
          <Card style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                style={quickActionStyle}
                onClick={() => navigate('/expenses')}
              >
                记一笔
              </Button>
              <Button
                icon={<CheckSquareOutlined />}
                style={quickActionStyle}
                onClick={() => navigate('/todos')}
              >
                新增待办
              </Button>
              <Button
                icon={<FlagOutlined />}
                style={quickActionStyle}
                onClick={() => navigate('/plans')}
              >
                新建计划
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
