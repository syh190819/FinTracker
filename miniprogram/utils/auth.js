/**
 * 认证相关 API
 */
const api = require('./api');
const { TOKEN_KEY, USER_KEY } = require('./constants');

/**
 * 用户注册
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{token: string, user: object}>}
 */
function register(username, password) {
  return api.post('/register', { username, password }).then(data => {
    if (data.token) {
      wx.setStorageSync(TOKEN_KEY, data.token);
      wx.setStorageSync(USER_KEY, data.user || { username });
    }
    return data;
  });
}

/**
 * 用户登录
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{token: string, user: object}>}
 */
function login(username, password) {
  return api.post('/login', { username, password }).then(data => {
    if (data.token) {
      wx.setStorageSync(TOKEN_KEY, data.token);
      wx.setStorageSync(USER_KEY, data.user || { username });
    }
    return data;
  });
}

/**
 * 登出
 */
function logout() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_KEY);
  wx.redirectTo({ url: '/pages/login/login' });
}

/**
 * 获取当前用户信息
 */
function getCurrentUser() {
  return wx.getStorageSync(USER_KEY);
}

module.exports = {
  register,
  login,
  logout,
  getCurrentUser
};
