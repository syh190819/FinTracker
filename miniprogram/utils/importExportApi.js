/**
 * 导入导出 API
 */
const api = require('./api');

function exportAll() {
  return api.get('/export');
}

function importAll(data) {
  return api.post('/import', data);
}

module.exports = { exportAll, importAll };
