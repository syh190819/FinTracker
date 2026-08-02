const auth = require('./utils/auth');

App({
  globalData: {
    userInfo: null,
    token: null
  },

  onLaunch() {
    const token = wx.getStorageSync('fintracker_token');
    const userInfo = wx.getStorageSync('fintracker_user');
    if (token) {
      this.globalData.token = token;
      this.globalData.userInfo = userInfo;
    }
  },

  /**
   * 检查登录状态，未登录则跳转登录页
   */
  checkLogin() {
    const token = this.globalData.token || wx.getStorageSync('fintracker_token');
    if (!token) {
      wx.redirectTo({ url: '/pages/login/login' });
      return false;
    }
    return true;
  },

  /**
   * 登出：清除本地数据，跳转登录页
   */
  logout() {
    this.globalData.token = null;
    this.globalData.userInfo = null;
    wx.removeStorageSync('fintracker_token');
    wx.removeStorageSync('fintracker_user');
    wx.redirectTo({ url: '/pages/login/login' });
  }
});
