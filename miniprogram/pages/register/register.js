const auth = require('../../utils/auth');

Page({
  data: {
    username: '',
    password: '',
    confirmPassword: '',
    loading: false,
    errorMsg: ''
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  onConfirmPasswordInput(e) {
    this.setData({ confirmPassword: e.detail.value });
  },

  onRegister() {
    const { username, password, confirmPassword } = this.data;
    if (!username.trim()) {
      this.setData({ errorMsg: '请输入用户名' });
      return;
    }
    if (!password.trim()) {
      this.setData({ errorMsg: '请输入密码' });
      return;
    }
    if (password.length < 6) {
      this.setData({ errorMsg: '密码至少 6 位' });
      return;
    }
    if (password !== confirmPassword) {
      this.setData({ errorMsg: '两次密码输入不一致' });
      return;
    }

    this.setData({ loading: true, errorMsg: '' });

    auth.register(username.trim(), password)
      .then(() => {
        wx.showToast({ title: '注册成功', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/expenses/expenses' });
        }, 1000);
      })
      .catch(err => {
        this.setData({ errorMsg: err.message || '注册失败' });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },

  goLogin() {
    wx.navigateBack();
  }
});
