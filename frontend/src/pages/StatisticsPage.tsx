import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { statisticsApi } from '../services/statisticsApi';
import type { MonthlyTotal, CategoryTotal, BudgetVsActual } from '../types/api';
import { formatMoney } from '../utils/helpers';

const COLORS = ['#1a1a2e', '#27ae60', '#c0392b', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22'];

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    maxWidth: 1100,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    margin: 0,
  },
  controls: {
    display: 'flex',
    gap: 16,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  label: {
    fontSize: 14,
    color: '#555',
  },
  select: {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #d9d9d9',
    fontSize: 14,
  },
  inputMonth: {
    padding: '5px 10px',
    borderRadius: 6,
    border: '1px solid #d9d9d9',
    fontSize: 14,
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    padding: '20px 16px',
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    marginTop: 0,
    marginBottom: 16,
    color: '#333',
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    padding: '40px 0',
    fontSize: 14,
  },
  loading: {
    textAlign: 'center',
    color: '#666',
    padding: '80px 0',
    fontSize: 16,
  },
};

export default function StatisticsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear.toString());
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [monthlyData, setMonthlyData] = useState<MonthlyTotal[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryTotal[]>([]);
  const [budgetData, setBudgetData] = useState<BudgetVsActual[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    statisticsApi
      .monthly(Number(year))
      .then(setMonthlyData)
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => {
    statisticsApi.category(month).then(setCategoryData);
    statisticsApi.budgetVsActual(month).then(setBudgetData);
  }, [month]);

  const monthLabel = (m: string) => `${m.slice(5)}月`;

  const chartTooltipStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
  };

  const hasNoData =
    !loading &&
    monthlyData.length === 0 &&
    categoryData.length === 0 &&
    budgetData.length === 0;

  return (
    <div style={styles.page}>
      {loading && (
        <div style={styles.loading}>加载中...</div>
      )}

      {!loading && hasNoData && (
        <div style={styles.empty}>暂无统计数据</div>
      )}

      {!loading && !hasNoData && (
        <>
          {/* Header */}
          <div style={styles.header}>
            <h1 style={styles.title}>统计</h1>
            <div style={styles.controls}>
              <span style={styles.label}>趋势年份</span>
              <select
                style={styles.select}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                {Array.from({ length: 10 }, (_, i) => currentYear - 5 + i).map(
                  (y) => (
                    <option key={y} value={y}>
                      {y}年
                    </option>
                  ),
                )}
              </select>

              <span style={styles.label}>月度统计</span>
              <input
                type="month"
                style={styles.inputMonth}
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
          </div>

          {/* Monthly Trend */}
          {monthlyData.length > 0 && (
            <div className="card" style={styles.card}>
              <h3 style={styles.cardTitle}>月度支出趋势</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(v) => monthLabel(v)}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    tickFormatter={(v) => `¥${v}`}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(value: number) => [formatMoney(value), '支出']}
                    labelFormatter={(label: string) => monthLabel(label)}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#3498db"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#3498db' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Category Distribution + Budget vs Actual */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {categoryData.length > 0 && (
              <div className="card" style={{ ...styles.card, flex: 1, minWidth: 320 }}>
                <h3 style={styles.cardTitle}>分类支出分布</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="total"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ category, percent }) =>
                        `${category} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine
                    >
                      {categoryData.map((_, idx) => (
                        <Cell
                          key={idx}
                          fill={COLORS[idx % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value: number) => [formatMoney(value), '支出']}
                    />
                    <Legend
                      verticalAlign="bottom"
                      wrapperStyle={{ fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {budgetData.length > 0 && (
              <div className="card" style={{ ...styles.card, flex: 1, minWidth: 320 }}>
                <h3 style={styles.cardTitle}>预算 vs 实际</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={budgetData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="category"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      tickFormatter={(v) => `¥${v}`}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value: number, name: string) => [
                        formatMoney(value),
                        name === 'budget' ? '预算' : '实际',
                      ]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      formatter={(value: string) =>
                        value === 'budget' ? '预算' : '实际'
                      }
                    />
                    <Bar dataKey="budget" fill="#3498db" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="actual" fill="#e74c3c" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
