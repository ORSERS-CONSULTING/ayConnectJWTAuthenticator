const { verifyAccessToken } = require('../utils/jwt');

function authUser(req, res, next) {
  try {
    const h = req.headers.authorization || '';

    const token = h.startsWith('Bearer ') ? h.slice(7) : '';

    if (!token) {
      return res.status(401).json({
        success: false,
        code: "AUTH_TOKEN_MISSING",
        message: "Missing token",
      });
    }

    const payload = verifyAccessToken(token);

    req.user = { id: payload.sub || payload.user_id, role: payload.role, email: payload.email };

    if (!req.user.id) {
      return res.status(401).json({
        success: false,
        code: "AUTH_TOKEN_INVALID",
        message: "Token missing subject",
      });
    }

    next();

  } catch (e) {
    return res.status(401).json({
      success: false,
      code: "ACCESS_TOKEN_EXPIRED",
      message: "Invalid or expired token",
    });
  }
}

function optionalAuthUser(req, res, next) {
  try {
    const h = req.headers.authorization || "";

    const token = h.startsWith("Bearer ") ? h.slice(7) : "";

    if (!token) {
      req.user = null; // 👈 important
      return next();
    }

    const payload = verifyAccessToken(token);

    req.user = {
      id: payload.sub || payload.user_id,
      role: payload.role,
      email: payload.email,
    };

    return next();

  } catch (e) {
    req.user = null;
    return next();
  }
}
module.exports = { authUser, optionalAuthUser };