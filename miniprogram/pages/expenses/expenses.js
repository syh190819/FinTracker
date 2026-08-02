const expenseApi = require('../../utils/expenseApi');
const budgetApi = require('../../utils/budgetApi');
const categoryApi = require('../../utils/categoryApi');
const dateUtil = require('../../utils/date');

const app = getApp();

Page({
  data: {
    currentMonth: dateUtil.currentMonth(),
    monthlyTotal: 0,
    monthlyBudget: 0,
    budgetPercent: 0,
    budgetRemaining: 0,
    expenses: [],
    loading: false,
    page: 1,
    hasMore: true,
    // 表单
    showForm: false,
    formAmount: '',
    formCategoryIndex: 0,
    formCategoryName: '',
    formDate: dateUtil.formatDate(new Date()),
    formNote: '',
    categories: []
  },

  onLoad() {
    if (!app.checkLogin()) return;
    this.loadData();
    this.loadCategories();
  },

  onPullDownRefresh() {
    this.setData({
      page: 1,
      hasMore: true,
      expenses: []
    });
    this.loadData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  loadCategories() {
    categoryApi.list().then(cats => {
      this.setData({ categories: cats || [] });
    }).catch(() => {});
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const month = this.data.currentMonth;
      const [expenseRes, budgetRes] = await Promise.all([
        expenseApi.list({ month, page: 1, page_size: 20 }),
        budgetApi.list({ month })
      ]);

      const expenses = expenseRes?.data || expenseRes || [];
      const budgets = budgetRes?.data || budgetRes || [];

      const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const budgetTotal = budgets.reduce((sum, b) => sum + Number(b.amount), 0);
      const percent = budgetTotal > 0 ? Math.min(100, Math.round((total / budgetTotal) * 100)) : 0;
      const remaining = budgetTotal > 0 ? (budgetTotal - total).toFixed(2) : 0;

      this.setData({
        expenses,
        monthlyTotal: total.toFixed(2),
        monthlyBudget: budgetTotal.toFixed(2),
        budgetPercent: percent,
        budgetRemaining: remaining,
        page: 1,
        hasMore: expenseRes?.has_more !== false
      });
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadMore() {
    this.setData({ loading: true });
    try {
      const nextPage = this.data.page + 1;
      const res = await expenseApi.list({ month: this.data.currentMonth, page: nextPage, page_size: 20 });
      const newExpenses = res?.data || res || [];
      this.setData({
        expenses: [...this.data.expenses, ...newExpenses],
        page: nextPage,
        hasMore: newExpenses.length >= 20
      });
    } catch (err) {
      // ignore
    } finally {
      this.setData({ loading: false });
    }
  },

  prevMonth() {
    this.setData({
      currentMonth: dateUtil.prevMonth(this.data.currentMonth),
      page: 1,
      expenses: [],
      hasMore: true
    });
    this.loadData();
  },

  nextMonth() {
    this.setData({
      currentMonth: dateUtil.nextMonth(this.data.currentMonth),
      page: 1,
      expenses: [],
      hasMore: true
    });
    this.loadData();
  },

  // ---- 表单 ----
  showAddForm() {
    this.setData({
      showForm: true,
      formAmount: '',
      formCategoryIndex: 0,
      formCategoryName: '',
      formDate: dateUtil.formatDate(new Date()),
      formNote: ''
    });
  },

  hideAddForm() {
    this.setData({ showForm: false });
  },

  stopPropagation() {},

  onFormAmountInput(e) {
    this.setData({ formAmount: e.detail.value });
  },

  onFormCategoryChange(e) {
    const idx = e.detail.value;
    const cat = this.data.categories[idx];
    this.setData({
      formCategoryIndex: idx,
      formCategoryName: cat ? cat.name : ''
    });
  },

  onFormDateChange(e) {
    this.setData({ formDate: e.detail.value });
  },

  onFormNoteInput(e) {
    this.setData({ formNote: e.detail.value });
  },

  submitExpense() {
    const { formAmount, formCategoryName, formDate, formNote } = this.data;

    if (!formAmount || isNaN(formAmount) || Number(formAmount) <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }
    if (!formCategoryName) {
      wx.showToast({ title: '请选择品类', icon: 'none' });
      return;
    }

    const data = {
      amount: Number(formAmount),
      category: formCategoryName,
      date: formDate,
      note: formNote || ''
    };

    expenseApi.create(data).then(() => {
      this.setData({ showForm: false });
      wx.showToast({ title: '已记录', icon: 'success' });
      this.loadData();
    }).catch(err => {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    });
  }
});
