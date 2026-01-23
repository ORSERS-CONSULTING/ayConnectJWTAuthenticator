const jwt = require('jsonwebtoken');
// const { JWT_SECRET } = require('../config/env');

const ISS = 'ay-backend';
const AUD = 'ay-app';

const DEFAULT_TTL = process.env.ACCESS_TOKEN_TTL || '1m';
function signAccessToken(payload, expiresIn = DEFAULT_TTL) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    issuer: 'ay-backend', audience: 'ay-app', expiresIn
  });
}


function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { issuer: ISS, audience: AUD });
}

module.exports = { signAccessToken, verifyAccessToken };
 



// utils/jwt.js
// const jwtLib = require('jsonwebtoken');

// const ISS = 'ay-backend';
// const AUD = 'ay-app';
// const DEFAULT_TTL = process.env.ACCESS_TOKEN_TTL || '30m';

// function signAccessToken(payload, expiresIn = DEFAULT_TTL) {
//   // Prefer keyring (its .sign is synchronous)
//   if (global && global.jwtKeyring && typeof global.jwtKeyring.sign === 'function') {
//     return global.jwtKeyring.sign(payload, { expiresIn, issuer: ISS, audience: AUD });
//   }
//   const secret = process.env.JWT_SECRET;
//   if (!secret) throw new Error('No JWT secret available');
//   return jwtLib.sign(payload, secret, { issuer: ISS, audience: AUD, expiresIn });
// }

// function verifyAccessToken(token) {
//   if (global && global.jwtKeyring && typeof global.jwtKeyring.verify === 'function') {
//     return global.jwtKeyring.verify(token, { issuer: ISS, audience: AUD });
//   }
//   const secret = process.env.JWT_SECRET;
//   if (!secret) throw new Error('No JWT secret available');
//   return jwtLib.verify(token, secret, { issuer: ISS, audience: AUD });
// }

// module.exports = { signAccessToken, verifyAccessToken };
