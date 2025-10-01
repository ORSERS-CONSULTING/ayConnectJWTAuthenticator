// Simple in-memory store. Replace with Redis/DB later if needed.
const map = Object.create(null);

function put(refreshToken, userId) {
  map[refreshToken] = String(userId);
}
function get(refreshToken) {
  return map[refreshToken] || null;
}
function revoke(refreshToken) {
  delete map[refreshToken];
}

module.exports = { put, get, revoke };
