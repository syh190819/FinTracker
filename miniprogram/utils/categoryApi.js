/**
 * 品类 API
 */
const api = require('./api');

function list() {
  return api.get('/categories');
}

function create(name, excluded = false, sortOrder = 0) {
  return api.post('/categories', { name, excluded, sort_order: sortOrder });
}

function update(id, data) {
  return api.put(`/categories/${id}`, data);
}

function deleteCategory(id) {
  return api.del(`/categories/${id}`);
}

module.exports = { list, create, update, delete: deleteCategory };
