const statisticsApi = require('../../utils/statisticsApi');
const dateUtil = require('../../utils/date');

const app = getApp();

Page({
  data: {
    currentYear: dateUtil.currentYear(),
    activeTab: 'monthly',
    monthlyData: [],
    categoryData: [],
    budgetData: [],
    loading: false
  },

  onLoad() {
    if (!app.checkLogin()) return;
    this.loadData();
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'monthly' && this.data.monthlyData.length === 0) this.loadMonthly();
    if (tab === 'category' && this.data.categoryData.length === 0) this.loadCategory();
    if (tab === 'budget' && this.data.budgetData.length === 0) this.loadBudgetVsActual();
  },

  loadData() {
    this.setData({ loading: true });
    Promise.all([
      this.loadMonthly(),
      this.loadCategory(),
      this.loadBudgetVsActual()
    ]).finally(() => {
      this.setData({ loading: false });
    });
  },

  async loadMonthly() {
    try {
      const res = await statisticsApi.monthly({ year: this.data.currentYear });
      const data = res?.data || res || [];
      this.setData({ monthlyData: data });
      this.drawMonthlyChart(data);
    } catch (err) {
      // ignore
    }
  },

  drawMonthlyChart(data) {
    // 使用微信 canvas 2d 绘制简易折线图
    const query = wx.createSelectorQuery();
    query.select('#monthlyChart').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0]) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const width = res[0].width;
      const height = res[0].height;

      canvas.width = width;
      canvas.height = height;

      ctx.clearRect(0, 0, width, height);

      if (!data || data.length === 0) {
        ctx.setFillStyle('#6b7280');
        ctx.setFontSize(13);
        ctx.fillText('暂无数据', width / 2 - 20, height / 2);
        return;
      }

      const padding = { top: 20, right: 10, bottom: 30, left: 50 };
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;

      const values = data.map(d => Number(d.total || 0));
      const maxVal = Math.max(...values, 1);
      const months = data.map(d => d.month ? d.month.slice(5) : '');

      // 绘制网格线
      ctx.setStrokeStyle('#e5e7eb');
      ctx.setLineWidth(0.5);
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
      }

      // 绘制折线
      const points = values.map((v, i) => ({
        x: padding.left + (chartW / (values.length - 1 || 1)) * i,
        y: padding.top + chartH - (v / maxVal) * chartH
      }));

      ctx.setStrokeStyle('#1a1a2e');
      ctx.setLineWidth(2);
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      // 绘制数据点
      ctx.setFillStyle('#1a1a2e');
      points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
        ctx.fill();
      });

      // 底部月份标签
      ctx.setFillStyle('#6b7280');
      ctx.setFontSize(10);
      months.forEach((m, i) => {
        if (i % 2 === 0 || months.length <= 6) {
          ctx.fillText(m, points[i].x - 8, height - 8);
        }
      });
    });
  },

  async loadCategory() {
    try {
      const res = await statisticsApi.category({ year: this.data.currentYear });
      const data = res?.data || res || [];

      const total = data.reduce((s, c) => s + Number(c.total || 0), 0);
      const enriched = data.map(c => ({
        ...c,
        total: Number(c.total || 0).toFixed(2),
        percent: total > 0 ? Math.round((Number(c.total) / total) * 100) : 0
      }));

      this.setData({ categoryData: enriched });
    } catch (err) {
      // ignore
    }
  },

  async loadBudgetVsActual() {
    try {
      const res = await statisticsApi.budgetVsActual({ year: this.data.currentYear });
      const data = res?.data || res || [];

      const enriched = data.map(b => {
        const budget = Number(b.budget || 0);
        const actual = Number(b.actual || 0);
        return {
          ...b,
          budget: budget.toFixed(2),
          actual: actual.toFixed(2),
          actualPercent: budget > 0 ? Math.min(100, Math.round((actual / budget) * 100)) : 0
        };
      });

      this.setData({ budgetData: enriched });
    } catch (err) {
      // ignore
    }
  },

  prevYear() {
    this.setData({
      currentYear: dateUtil.prevYear(this.data.currentYear),
      monthlyData: [],
      categoryData: [],
      budgetData: []
    });
    this.loadData();
  },

  nextYear() {
    this.setData({
      currentYear: dateUtil.nextYear(this.data.currentYear),
      monthlyData: [],
      categoryData: [],
      budgetData: []
    });
    this.loadData();
  }
});
