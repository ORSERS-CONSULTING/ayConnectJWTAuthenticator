// scripts/rotate-jwt-key.js
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getSecretBundleWithMeta, createSecretBundle } = require('../config/vault');

function makeNewKeyJson() {
  const kid = uuidv4();
  const secret = crypto.randomBytes(64).toString('hex');
  return JSON.stringify({ kid, secret });
}

async function run() {
  const secretOcId = process.env.JWT_SECRET;
  if (!secretOcId) {
    console.error('Missing env JWT_SECRET_OCID');
    process.exit(2);
  }
 
  const { plaintext: curPlain, versionNumber: curVer } = await getSecretBundleWithMeta(secretOcId);

  // (No external PREVIOUS secret required — previous will be the bundle with version curVer)
  const newJson = makeNewKeyJson();
  const parsed = JSON.parse(newJson);
  await createSecretBundle(secretOcId, newJson);
 
}

run().catch(e => { console.error('Rotation failed:', e && e.message || e); process.exit(1); });
