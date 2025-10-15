// config/vault.js
const {
  InstancePrincipalsAuthenticationDetailsProviderBuilder
} = require("oci-common");
const { SecretsClient } = require("oci-secrets");

async function makeClient() {
  const provider = await new InstancePrincipalsAuthenticationDetailsProviderBuilder().build();
  const client = new SecretsClient({ authenticationDetailsProvider: provider });
  // SDK uses `region` or `regionId` depending on version; your code used regionId earlier.
  client.regionId = process.env.OCI_REGION || "me-dubai-1";
  return client;
}

/**
 * Original helper: returns plaintext content of CURRENT bundle (string)
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
 * New helper: fetch the secret bundle and return both plaintext and metadata
 * If versionNumber is omitted, returns the CURRENT bundle.
 *
 * Returns: { plaintext: string, versionNumber: number, meta: secretBundle }
 */
async function getSecretBundleWithMeta(secretOcid, versionNumber = null) {
  if (!secretOcid) throw new Error("secret OCID missing");
  const client = await makeClient();

  const req = { secretId: secretOcid };
  if (versionNumber != null) {
    // OCI SDK supports requesting a specific version number; param name may be secretVersionNumber
    // If your SDK version uses a different param name, swap to that (I can help update).
    req.secretVersionNumber = Number(versionNumber);
  } else {
    req.stage = "CURRENT";
  }

  const { secretBundle } = await client.getSecretBundle(req);
  const b64 = secretBundle.secretBundleContent.content;
  const plaintext = Buffer.from(b64, "base64").toString("utf8");
  // the SDK secretBundle should include a version number field — name may be `versionNumber` or similar.
  const version = secretBundle.versionNumber || secretBundle.secretVersionNumber || secretBundle.version;
  return { plaintext, versionNumber: Number(version), meta: secretBundle };
}

/**
 * Upload a new secret-bundle (create new version) for the given secret OCID
 * plaintextUtf8 -> base64
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
