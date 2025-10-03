const jwt = require('jsonwebtoken');
// const { JWT_SECRET } = require('../config/env');

const ISS = 'ay-backend';
const AUD = 'ay-app';

function signAccessToken(payload, expiresIn = '30m') {
  return jwt.sign(payload, process.env.JWT_SECRET, { issuer: ISS, audience: AUD, expiresIn });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { issuer: ISS, audience: AUD });
}

module.exports = { signAccessToken, verifyAccessToken };
