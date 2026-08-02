const budgetApi = require('../../utils/budgetApi');
const categoryApi = require('../../utils/categoryApi');
const dateUtil = require('../../utils/date');

const app = getApp();

Page({
  data: {
    currentMonth: dateUtil.currentMonth(),
    budgets: [],
    loading: false,
    showForm: false,
    editItems: [],
    categories: []
  },

  onLoad() {
    if (!app.checkLogin()) return;
    this.loadCategories();
    this.loadBudgets();
  },

  loadCategories() {
    categoryApi.list().then(cats => {
      this.setData({ categories: cats || [] });
    }).catch(() => {});
  },

  async loadBudgets() {
    this.setData({ loading: true });
    try {
      const res = await budgetApi.list({ month: this.data.currentMonth });
      const budgets = res?.data || res || [];

      // 如果有实际支出数据，计算进度
      const enriched = budgets.map(b => {
        const amount = Number(b.amount);
        const spent = Number(b.spent || 0);
        return {
          ...b,
          amount: amount.toFixed(2),
          spent: spent.toFixed(2),
          percent: amount > 0 ? Math.min(100, Math.round((spent / amount) * 100)) : 0,
          remaining: (amount - spent).toFixed(2)
        };
      });

      this.setData({ budgets: enriched });
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  prevMonth() {
    this.setData({ currentMonth: dateUtil.prevMonth(this.data.currentMonth) });
    this.loadBudgets();
  },

  nextMonth() {
    this.setData({ currentMonth: dateUtil.nextMonth(this.data.currentMonth) });
    this.loadBudgets();
  },

  showEditForm() {
    // 用当前品类列表初始化编辑项
    const cats = this.data.categories;
    const existing = this.data.budgets;

    const items = cats.map(c => {
      const found = existing.find(b => b.category === c.name);
      return {
        category: c.name,
        amount: found ? found.amount : '0'
      };
    });

    this.setData({
      showForm: true,
      editItems: items
    });
  },

  hideEditForm() {
    this.setData({ showForm: false });
  },

  stopPropagation() {},

  onEditAmountInput(e) {
    const idx = e.currentTarget.dataset.idx;
    const items = [...this.data.editItems];
    items[idx].amount = e.detail.value;
    this.setData({ editItems: items });
  },

  saveBudgets() {
    const month = this.data.currentMonth;
    const promises = this.data.editItems
      .filter(item => Number(item.amount) > 0)
      .map(item => {
        return budgetApi.create({
          month,
          category: item.category,
          amount: Number(item.amount)
        });
      });

    if (promises.length === 0) {
      wx.showToast({ title: '请设置至少一个预算', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    Promise.all(promises)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '保存成功', icon: 'success' });
        this.setData({ showForm: false });
        this.loadBudgets();
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '保存失败', icon: 'none' });
      });
  }
});
