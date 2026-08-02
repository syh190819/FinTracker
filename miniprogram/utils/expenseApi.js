/**
 * 支出 API
 */
const api = require('./api');

function list(params) {
  return api.get('/expenses', params);
}

function create(data) {
  return api.post('/expenses', data);
}

function update(id, data) {
  return api.put(`/expenses/${id}`, data);
}

function deleteExpense(id) {
  return api.del(`/expenses/${id}`);
}

module.exports = { list, create, update, delete: deleteExpense };
