// config/vault.js
const {
  InstancePrincipalsAuthenticationDetailsProviderBuilder
} = require("oci-common");
const { SecretsClient } = require("oci-secrets");

async function makeClient() {
  const provider = await new InstancePrincipalsAuthenticationDetailsProviderBuilder().build();
  const client = new SecretsClient({ authenticationDetailsProvider: provider });
  client.regionId = process.env.OCI_REGION || "me-dubai-1";
  return client;
}

/**
 * Legacy: get secret CURRENT plaintext (keeps compatibility)
 */
async function getSecret(secretOcid) {
  if (!secretOcid) throw new Error("secret OCID missing");
  const client = await makeClient();
  const { secretBundle } = await client.getSecretBundle({
    secretId: secretOcid,
    stage: "CURRENT",
  });
  const b64 = secretBundle.secretBundleContent.content;
  return Buffer.from(b64, "base64").toString("utf8");
}

/**
 * Fetch a specific secret bundle (current if versionNumber omitted).
 * Returns { plaintext, versionNumber, meta }
 */
async function getSecretBundleWithMeta(secretOcid, versionNumber = null) {
  if (!secretOcid) throw new Error("secret OCID missing");
  const client = await makeClient();

  const req = { secretId: secretOcid };
  if (versionNumber != null) {
    // OCI SDK expects `secretVersionNumber` to fetch a specific version
    req.secretVersionNumber = Number(versionNumber);
  } else {
    req.stage = "CURRENT";
  }

  const { secretBundle } = await client.getSecretBundle(req);
  const b64 = secretBundle.secretBundleContent.content;
  const plaintext = Buffer.from(b64, "base64").toString("utf8");

  // SDK may expose the version as versionNumber or secretVersionNumber
  const version = secretBundle.versionNumber ?? secretBundle.secretVersionNumber ?? secretBundle.version;
  return { plaintext, versionNumber: Number(version), meta: secretBundle };
}

/**
 * Create a new secret bundle (adds a new version to the secret resource).
 * plaintextUtf8 will be base64-encoded for the API.
 */
async function createSecretBundle(secretOcid, plaintextUtf8) {
  if (!secretOcid) throw new Error("secret OCID missing");
  const client = await makeClient();

  const b64 = Buffer.from(plaintextUtf8, "utf8").toString("base64");
  const createSecretBundleDetails = {
    secretBundleContent: {
      content: b64,
      contentType: "BASE64",
    },
  };

  const resp = await client.createSecretBundle({
    secretId: secretOcid,
    createSecretBundleDetails,
  });

  return resp;
}

module.exports = {
  getSecret,
  getSecretBundleWithMeta,
  createSecretBundle,
};
