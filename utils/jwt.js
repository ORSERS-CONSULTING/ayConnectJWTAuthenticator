// utils/jwt.js
const jwtLib = require('jsonwebtoken');

const ISS = 'ay-backend';
const AUD = 'ay-app';
const DEFAULT_TTL = process.env.ACCESS_TOKEN_TTL || '5m';

async function signAccessToken(payload, expiresIn = DEFAULT_TTL) {
  if (global && global.jwtKeyring && typeof global.jwtKeyring.sign === 'function') {
    return global.jwtKeyring.sign(payload, { expiresIn, issuer: ISS, audience: AUD });
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('No JWT secret available');
  return jwtLib.sign(payload, secret, { issuer: ISS, audience: AUD, expiresIn });
}

async function verifyAccessToken(token) {
  if (global && global.jwtKeyring && typeof global.jwtKeyring.verify === 'function') {
    return global.jwtKeyring.verify(token, { issuer: ISS, audience: AUD });
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('No JWT secret available');
  return jwtLib.verify(token, secret, { issuer: ISS, audience: AUD });
}

module.exports = { signAccessToken, verifyAccessToken };
