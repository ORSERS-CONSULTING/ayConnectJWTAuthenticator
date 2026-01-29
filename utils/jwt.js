const jwt = require('jsonwebtoken');

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
 
