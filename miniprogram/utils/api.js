/**
 * FinTracker API 客户端
 * 封装 wx.request，自动注入 JWT token，统一错误处理
 */

const { API_BASE_URL, TOKEN_KEY } = require('./constants');

/**
 * 发起 API 请求
 * @param {string} method - HTTP 方法
 * @param {string} path - API 路径（如 /expenses）
 * @param {object} data - 请求体 / 查询参数
 * @param {object} options - 额外选项
 * @returns {Promise}
 */
function request(method, path, data = null, options = {}) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync(TOKEN_KEY);
    const header = {
      'Content-Type': 'application/json'
    };
    if (token) {
      header['Authorization'] = `Bearer ${token}`;
    }

    wx.request({
      url: `${API_BASE_URL}${path}`,
      method: method,
      data: data,
      header: header,
      success(res) {
        if (res.statusCode === 401) {
          // Token 过期或无效，清除并跳转登录
          wx.removeStorageSync(TOKEN_KEY);
          wx.removeStorageSync('fintracker_user');
          wx.redirectTo({ url: '/pages/login/login' });
          reject(new Error('登录已过期，请重新登录'));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          const errMsg = res.data?.error || res.data?.message || `请求失败 (${res.statusCode})`;
          reject(new Error(errMsg));
        }
      },
      fail(err) {
        reject(new Error('网络请求失败，请检查网络连接'));
      }
    });
  });
}

// 快捷方法
const get = (path, params) => request('GET', path, params);
const post = (path, data) => request('POST', path, data);
const put = (path, data) => request('PUT', path, data);
const del = (path) => request('DELETE', path);

module.exports = {
  request, get, post, put, del
};
