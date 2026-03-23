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
async function initiateHostedCheckout({
  amount,
  orderId,
  payment_type,
  payment_id,
}) {
  // ✅ safer validation

  if (amount == null || !orderId) {
    throw new Error("amount, orderId are required");
  }

  const baseUrl = process.env.MPGS_BASE_URL;
  const merchantId = process.env.MERCHANT_ID;
  const currency = process.env.CURRENCY || "AED";

  const url = `${baseUrl}/api/rest/version/100/merchant/${merchantId}/session`;

  const payload = {
    apiOperation: "INITIATE_CHECKOUT",
    checkoutMode: "WEBSITE",

    interaction: {
      operation: "PURCHASE",

      merchant: {
        name: "AY Connect",
        url: "https://ayconnect.yalayis.ai",
        logo: "https://ayconnect.yalayis.ai/assets/yalayis_logo.png",
      },

      // Optional but recommended
      locale: "en_US",

      displayControl: {
        billingAddress: "HIDE",
        customerEmail: "HIDE",
        shipping: "HIDE",
      },

      returnUrl: `https://ayconnect.yalayis.ai/payment/return?payment_type=${payment_type}&paymentId=${payment_id}`,
    },

    order: {
      id: orderId,
      amount: Number(amount).toFixed(2),
      currency,
      description: "AY Connect Service Payment",
    },
  };

  let res;
  try {
    res = await axios.post(url, payload, {
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });
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
  initiateHostedCheckout,
  retrieveOrder,
};
