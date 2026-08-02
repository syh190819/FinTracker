/**
 * 预算 API
 */
const api = require('./api');

function list(params) {
  return api.get('/budgets', params);
}

function create(data) {
  return api.post('/budgets', data);
}

function update(id, data) {
  return api.put(`/budgets/${id}`, data);
}

function deleteBudget(id) {
  return api.del(`/budgets/${id}`);
}

module.exports = { list, create, update, delete: deleteBudget };
