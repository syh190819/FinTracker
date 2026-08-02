/**
 * 存款 API
 */
const api = require('./api');

function listPlans() {
  return api.get('/deposit-plans');
}

function createPlan(data) {
  return api.post('/deposit-plans', data);
}

function updatePlan(id, data) {
  return api.put(`/deposit-plans/${id}`, data);
}

function deletePlan(id) {
  return api.del(`/deposit-plans/${id}`);
}

function listTransactions(planId) {
  return api.get(`/deposit-plans/${planId}/transactions`);
}

function createTransaction(planId, data) {
  return api.post(`/deposit-plans/${planId}/transactions`, data);
}

module.exports = {
  listPlans, createPlan, updatePlan, deletePlan,
  listTransactions, createTransaction
};
