const sharingApi = require('../../utils/sharingApi');

const app = getApp();

Page({
  data: {
    inviteCode: '',
    inviteLoading: false,
    acceptCode: '',
    partners: [],
    loading: false
  },

  onLoad() {
    if (!app.checkLogin()) return;
    this.loadPartners();
  },

  onShow() {
    this.loadPartners();
  },

  async loadPartners() {
    this.setData({ loading: true });
    try {
      const res = await sharingApi.getRelationships();
      const partners = res?.data || res || [];

      const enriched = partners.map(p => {
        const scope = p.scope || {};
        const labels = [];
        if (scope.expenses) labels.push('支出');
        if (scope.budgets) labels.push('预算');
        if (scope.deposits) labels.push('存款');
        return {
          ...p,
          scopeLabel: labels.join(' / ') || '暂无'
        };
      });

      this.setData({ partners: enriched });
    } catch (err) {
      // ignore
    } finally {
      this.setData({ loading: false });
    }
  },

  generateInvite() {
    this.setData({ inviteLoading: true });
    sharingApi.invite().then(res => {
      const code = res.invite_code || res.code || '';
      this.setData({ inviteCode: code });
    }).catch(err => {
      wx.showToast({ title: err.message || '生成失败', icon: 'none' });
    }).finally(() => {
      this.setData({ inviteLoading: false });
    });
  },

  copyInviteCode() {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  onAcceptCodeInput(e) {
    this.setData({ acceptCode: e.detail.value });
  },

  acceptInvite() {
    const code = this.data.acceptCode.trim();
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '加入中...' });
    sharingApi.accept(code).then(() => {
      wx.hideLoading();
      wx.showToast({ title: '加入成功', icon: 'success' });
      this.setData({ acceptCode: '' });
      this.loadPartners();
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: err.message || '加入失败', icon: 'none' });
    });
  },

  removePartner(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;

    wx.showModal({
      title: '确认解除',
      content: `确定解除与"${name}"的共享关系？`,
      success: (res) => {
        if (res.confirm) {
          sharingApi.delete(id).then(() => {
            wx.showToast({ title: '已解除', icon: 'success' });
            this.loadPartners();
          }).catch(err => {
            wx.showToast({ title: err.message || '操作失败', icon: 'none' });
          });
        }
      }
    });
  }
});
