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
  const secretOcId = process.env.JWT_SECRET_OCID;
  if (!secretOcId) {
    console.error('Missing env JWT_SECRET_OCID');
    process.exit(2);
  }

  console.log('Fetching current to learn version...');
  const { plaintext: curPlain, versionNumber: curVer } = await getSecretBundleWithMeta(secretOcId);
  console.log('Current version:', curVer);

  // (No external PREVIOUS secret required — previous will be the bundle with version curVer)
  console.log('Generating new key and creating new bundle (this becomes version', curVer + 1, ')...');
  const newJson = makeNewKeyJson();
  const parsed = JSON.parse(newJson);
  await createSecretBundle(secretOcId, newJson);
  console.log('Rotation done. New kid:', parsed.kid);
  console.log('Old key remains available as version', curVer, '— jwtKeyring fetches curVer-1 automatically as previous.');
}

run().catch(e => { console.error('Rotation failed:', e && e.message || e); process.exit(1); });
