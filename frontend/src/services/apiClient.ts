import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截器 — 自动附加 JWT
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('fintracker_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器 — 401 时清除 token 并跳转登录
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      localStorage.removeItem('fintracker_token');
      localStorage.removeItem('fintracker_user');
      // 不在登录页时才跳转
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export default apiClient;
