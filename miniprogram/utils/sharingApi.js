/**
 * 共享 API
 */
const api = require('./api');

function invite() {
  return api.post('/share/invite');
}

function accept(inviteCode) {
  return api.post('/share/accept', { invite_code: inviteCode });
}

function getRelationships() {
  return api.get('/share/relationships');
}

function updateScope(id, scope) {
  return api.put(`/share/${id}/scope`, { scope });
}

function deleteSharing(id) {
  return api.del(`/share/${id}`);
}

module.exports = { invite, accept, getRelationships, updateScope, delete: deleteSharing };
