const { verifyAccessToken } = require('../utils/jwt');

function authUser(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) return res.status(401).json({ message: 'Missing token' });
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub || payload.user_id, role: payload.role, email: payload.email };
    if (!req.user.id) return res.status(401).json({ message: 'Token missing subject' });
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid/expired token' });
  }
}

module.exports = { authUser };
