const axios = require("axios");

/**
 * ----------------------------------------------------
 * Helpers
 * ----------------------------------------------------
 */
function getAuthHeader() {
  const merchantId = process.env.MERCHANT_ID;
  const password = process.env.MERCHANT_PASSWORD;

  if (!merchantId || !password) {
    throw new Error("MPGS merchant credentials are missing");
  }

  return (
    "Basic " +
    Buffer.from(`merchant.${merchantId}:${password}`).toString("base64")
  );
}

/**
 * ----------------------------------------------------
 * Create Hosted Checkout Session
 * ----------------------------------------------------
 */
async function createCheckoutSession({ amount, orderId, returnUrl }) {
  // ✅ safer validation
  if (amount == null || !orderId || !returnUrl) {
    throw new Error("amount, orderId and returnUrl are required");
  }
  console.log("🧪 createCheckoutSession INPUT", {
    amount,
    orderId,
    returnUrl,
    envReturnUrl: process.env.HPP_RETURN_URL,
  });
  const baseUrl = process.env.MPGS_BASE_URL;
  const merchantId = process.env.MERCHANT_ID;
  const currency = process.env.CURRENCY || "AED";
  console.log("🧪 MPGS CONFIG", {
    merchantId,
    currency,
    baseUrl,
  });
  const url = `${baseUrl}/api/rest/version/100/merchant/${merchantId}/session`;

  const payload = {
  apiOperation: "INITIATE_CHECKOUT",
  interaction: {
    operation: "PURCHASE",
    returnUrl,
    cancelUrl: returnUrl, // ✅ REQUIRED in app / cross-origin usage
    merchant: {
      name: "AY Connect",
    },
  },
  order: {
    id: String(orderId),
    amount: Number(Number(amount).toFixed(2)), // ✅ safe formatting
    currency,
    description: "Yalayis Parking Payment", // ✅ REQUIRED for WEBSITE mode
  },
};

  console.log("🟣 MPGS PAYLOAD:", JSON.stringify(payload, null, 2));

  let res;
  try {
    res = await axios.post(url, payload, {
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });
    console.log("🧪 MPGS RESPONSE:", JSON.stringify(res.data, null, 2));
  } catch (err) {
    const msg =
      err.response?.data || err.message || "Failed to create MPGS session";
    throw new Error(`MPGS session error: ${JSON.stringify(msg)}`);
  }

  const sessionId = res.data?.session?.id;
  if (!sessionId) {
    throw new Error("MPGS did not return a session ID");
  }

  return { sessionId };
}

/**
 * ----------------------------------------------------
 * Retrieve Order (Verification)
 * ----------------------------------------------------
 */
async function retrieveOrder(orderId) {
  if (!orderId) {
    throw new Error("orderId is required");
  }

  const baseUrl = process.env.MPGS_BASE_URL;
  const merchantId = process.env.MERCHANT_ID;

  const url = `${baseUrl}/api/rest/version/100/merchant/${merchantId}/order/${orderId}`;

  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    return res.data;
  } catch (err) {
    const msg =
      err.response?.data || err.message || "Failed to retrieve MPGS order";
    throw new Error(`MPGS retrieve order error: ${JSON.stringify(msg)}`);
  }
}

module.exports = {
  createCheckoutSession,
  retrieveOrder,
};
