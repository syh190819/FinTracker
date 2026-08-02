const depositApi = require('../../utils/depositApi');

const app = getApp();

Page({
  data: {
    plans: [],
    loading: false,
    showForm: false,
    formName: '',
    formGoal: ''
  },

  onLoad() {
    if (!app.checkLogin()) return;
    this.loadPlans();
  },

  onShow() {
    this.loadPlans();
  },

  async loadPlans() {
    this.setData({ loading: true });
    try {
      const res = await depositApi.listPlans();
      const plans = res?.data || res || [];

      const enriched = plans.map(p => {
        const goal = Number(p.monthly_goal || 0);
        const balance = Number(p.balance || 0);
        return {
          ...p,
          monthly_goal: goal.toFixed(2),
          balance: balance.toFixed(2),
          goalPercent: goal > 0 ? Math.min(100, Math.round((balance / goal) * 100)) : 0
        };
      });

      this.setData({ plans: enriched });
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 打开计划明细（跳转到单独页面或弹窗）
  openPlanDetail(e) {
    const planId = e.currentTarget.dataset.id;
    const plan = this.data.plans.find(p => p.id === planId);
    if (!plan) return;

    wx.showActionSheet({
      itemList: ['查看明细', '存取操作', '删除计划'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.showTransactions(plan);
        } else if (res.tapIndex === 1) {
          this.showTransactionForm(plan);
        } else if (res.tapIndex === 2) {
          this.deletePlan(plan);
        }
      }
    });
  },

  showTransactions(plan) {
    wx.showLoading({ title: '加载中...' });
    depositApi.listTransactions(plan.id).then(res => {
      wx.hideLoading();
      const transactions = res?.data || res || [];
      let detail = `计划: ${plan.name}\n余额: ¥${plan.balance}\n\n存取记录:\n`;
      transactions.forEach(t => {
        const sign = t.type === 'deposit' ? '+' : '-';
        detail += `${t.date}  ${sign}¥${t.amount}  ${t.note || ''}\n`;
      });
      if (transactions.length === 0) {
        detail += '(暂无记录)';
      }
      wx.showModal({
        title: '明细',
        content: detail,
        showCancel: false
      });
    }).catch(() => {
      wx.hideLoading();
    });
  },

  showTransactionForm(plan) {
    wx.showModal({
      title: '存取操作',
      content: `计划: ${plan.name}\n当前余额: ¥${plan.balance}`,
      editable: true,
      placeholderText: '输入金额',
      success: (res) => {
        if (res.confirm && res.content) {
          const amount = Number(res.content);
          if (isNaN(amount) || amount <= 0) {
            wx.showToast({ title: '请输入有效金额', icon: 'none' });
            return;
          }
          this.showTransactionType(plan, amount);
        }
      }
    });
  },

  showTransactionType(plan, amount) {
    wx.showActionSheet({
      itemList: ['存入', '取出'],
      success: (res) => {
        const type = res.tapIndex === 0 ? 'deposit' : 'withdraw';
        depositApi.createTransaction(plan.id, {
          type,
          amount,
          date: new Date().toISOString().slice(0, 10)
        }).then(() => {
          wx.showToast({ title: '操作成功', icon: 'success' });
          this.loadPlans();
        }).catch(err => {
          wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        });
      }
    });
  },

  deletePlan(plan) {
    wx.showModal({
      title: '确认删除',
      content: `确定删除"${plan.name}"吗？`,
      success: (res) => {
        if (res.confirm) {
          depositApi.deletePlan(plan.id).then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadPlans();
          }).catch(err => {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          });
        }
      }
    });
  },

  showCreateForm() {
    this.setData({
      showForm: true,
      formName: '',
      formGoal: ''
    });
  },

  hideCreateForm() {
    this.setData({ showForm: false });
  },

  stopPropagation() {},

  onFormNameInput(e) {
    this.setData({ formName: e.detail.value });
  },

  onFormGoalInput(e) {
    this.setData({ formGoal: e.detail.value });
  },

  createPlan() {
    const { formName, formGoal } = this.data;
    if (!formName.trim()) {
      wx.showToast({ title: '请输入计划名称', icon: 'none' });
      return;
    }

    depositApi.createPlan({
      name: formName.trim(),
      monthly_goal: Number(formGoal) || 0
    }).then(() => {
      wx.showToast({ title: '创建成功', icon: 'success' });
      this.setData({ showForm: false });
      this.loadPlans();
    }).catch(err => {
      wx.showToast({ title: err.message || '创建失败', icon: 'none' });
    });
  }
});
