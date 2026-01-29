// lib/jwtKeyring.js
require('dotenv').config();    
const jwt = require('jsonwebtoken');
const { getSecretBundleWithMeta } = require('../config/vault');
const DEFAULT_REFRESH_MS = 30_000;

function emptyKeys() {
  return { current: null, previous: null, currentVersion: null };
}

module.exports = {
  async init(opts = {}) {
    const refreshMs = opts.refreshIntervalMs || DEFAULT_REFRESH_MS;
    // Use the single env the app already has
    const secretOcId = process.env.JWT_SECRET_OCID;

    if (!secretOcId && !process.env.JWT_SECRET) {
      throw new Error('No JWT_SECRET_OCID and no JWT_SECRET fallback configured');
    }

    this._state = { keys: emptyKeys(), timer: null, secretOcId };

    const loadOnce = async () => {
      try {
        const keys = { current: null, previous: null, currentVersion: null };

        if (this._state.secretOcId) {
          // get current bundle + version
          const { plaintext: curPlain, versionNumber: curVer } = await getSecretBundleWithMeta(this._state.secretOcId);
          keys.currentVersion = curVer;

          try {
            keys.current = JSON.parse(curPlain);
          } catch (e) {
            // if secret stored as raw string, treat as raw secret with a default kid
            keys.current = { kid: process.env.JWT_KID_CURRENT || `v${curVer}`, secret: curPlain };
          }

          // try to fetch previous version (curVer - 1)
          if (typeof curVer === 'number' && curVer > 0) {
            const prevVer = curVer - 1;
            try {
              const { plaintext: prevPlain } = await getSecretBundleWithMeta(this._state.secretOcId, prevVer);
              try {
                keys.previous = JSON.parse(prevPlain);
              } catch (e2) {
                keys.previous = { kid: process.env.JWT_KID_PREVIOUS || `v${prevVer}`, secret: prevPlain };
              }
            } catch (ePrev) {
              // previous version might not exist yet — that's fine
              keys.previous = null;
            }
          }
        } else if (process.env.JWT_SECRET) {
          // legacy fallback: single env var
          keys.current = { kid: process.env.JWT_KID_CURRENT || 'cur', secret: process.env.JWT_SECRET };
        }

        if (keys.current) {
          this._state.keys = keys;
          if (process.env.NODE_ENV !== 'production') {
          }
        } else {
          throw new Error('No current JWT key could be loaded');
        }
      } catch (err) {
        console.error('[jwtKeyring] load error:', err.message || err);
        if (!this._state.keys.current) throw err;
      }
    };

    // initial load
    await loadOnce();

    // periodic refresh
    this._state.timer = setInterval(async () => {
      try { await loadOnce(); } catch (e) { console.error('[jwtKeyring] refresh failed:', e.message || e); }
    }, refreshMs);

    // sign & verify
    this.sign = (payload, opts = {}) => {
      const ks = this._state.keys;
      if (!ks || !ks.current) throw new Error('No current JWT key loaded');
      return jwt.sign(payload, ks.current.secret, {
        algorithm: 'HS256',
        header: { kid: ks.current.kid },
        expiresIn: opts.expiresIn || process.env.ACCESS_TOKEN_TTL || '30m',
        issuer: opts.issuer || 'ay-backend',
        audience: opts.audience || 'ay-app',
      });
    };

    this.verify = (token, opts = {}) => {
      const ks = this._state.keys;
      if (!ks || !ks.current) throw new Error('No current JWT key loaded');

      const decoded = jwt.decode(token, { complete: true }) || {};
      const kid = decoded?.header?.kid;

      const trySecrets = [];
      if (kid) {
        if (ks.current?.kid === kid) trySecrets.push(ks.current.secret);
        if (ks.previous?.kid === kid) trySecrets.push(ks.previous.secret);
      } else {
        trySecrets.push(ks.current.secret);
        if (ks.previous) trySecrets.push(ks.previous.secret);
      }

      let lastErr = null;
      for (const s of trySecrets) {
        try {
          return jwt.verify(token, s, {
            algorithms: ['HS256'],
            issuer: opts.issuer || 'ay-backend',
            audience: opts.audience || 'ay-app',
          });
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error('JWT verification failed');
    };

    this.getKids = () => ({ current: this._state.keys.current?.kid, previous: this._state.keys.previous?.kid, currentVersion: this._state.keys.currentVersion });
    this.stop = () => { if (this._state.timer) clearInterval(this._state.timer); };
    return this;
  }
};
