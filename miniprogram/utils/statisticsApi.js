/**
 * 统计 API
 */
const api = require('./api');

function monthly(params) {
  return api.get('/statistics/monthly', params);
}

function category(params) {
  return api.get('/statistics/category', params);
}

function budgetVsActual(params) {
  return api.get('/statistics/budget-vs-actual', params);
}

module.exports = { monthly, category, budgetVsActual };
