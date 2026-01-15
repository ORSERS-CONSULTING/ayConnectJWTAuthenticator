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
 * Called when user clicks "Pay"
 */
async function createCheckoutSession({ amount, orderId, returnUrl }) {
  if (!amount || !orderId || !returnUrl) {
    throw new Error("amount, orderId and returnUrl are required");
  }

  const baseUrl = process.env.MPGS_BASE_URL;
  const merchantId = process.env.MERCHANT_ID;
  const currency = process.env.CURRENCY || "AED";

  const url = `${baseUrl}/api/rest/version/100/merchant/${merchantId}/session`;

  const payload = {
    apiOperation: "CREATE_CHECKOUT_SESSION",
    order: {
      id: String(orderId),
      amount: Number(amount),
      currency,
    },
    interaction: {
      returnUrl,
      merchant: {
        name: "AY Connect",
      },
    },
  };

  console.log("🟣 MPGS PAYLOAD:", JSON.stringify(payload, null, 2));

  const res = await axios.post(url, payload, {
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });

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
 * Called AFTER checkout to verify PAID / FAILED
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
