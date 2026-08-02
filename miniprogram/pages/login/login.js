const auth = require('../../utils/auth');

Page({
  data: {
    username: '',
    password: '',
    loading: false,
    errorMsg: ''
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  onLogin() {
    const { username, password } = this.data;
    if (!username.trim()) {
      this.setData({ errorMsg: '请输入用户名' });
      return;
    }
    if (!password.trim()) {
      this.setData({ errorMsg: '请输入密码' });
      return;
    }

    this.setData({ loading: true, errorMsg: '' });

    auth.login(username.trim(), password)
      .then(() => {
        wx.switchTab({ url: '/pages/expenses/expenses' });
      })
      .catch(err => {
        this.setData({ errorMsg: err.message || '登录失败' });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },

  goRegister() {
    wx.navigateTo({ url: '/pages/register/register' });
  }
});
