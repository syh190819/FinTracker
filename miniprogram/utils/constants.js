/**
 * FinTracker 小程序常量配置
 */

// API 基础地址 - 部署后改为生产域名
const API_BASE_URL = 'https://localhost:8080/api';

// JWT Token 存储 key
const TOKEN_KEY = 'fintracker_token';
const USER_KEY = 'fintracker_user';

// 分页配置
const PAGE_SIZE = 20;

module.exports = {
  API_BASE_URL,
  TOKEN_KEY,
  USER_KEY,
  PAGE_SIZE
};
