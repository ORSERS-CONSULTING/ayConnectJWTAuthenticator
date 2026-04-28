const axios = require("axios");

/**
 * ----------------------------------------------------
 * Helpers
 * ----------------------------------------------------
 */
// function getAuthHeader() {
//   const merchantId = process.env.MERCHANT_ID;
//   const password = process.env.MERCHANT_PASSWORD;
//   if (!merchantId || !password) {
//     throw new Error("MPGS merchant credentials are missing");
//   }

//   const raw = `merchant.${merchantId}:${password}`;
//   const encoded = Buffer.from(raw).toString("base64");

//   // 🔥 ADD THIS LINE HERE

//   return "Basic " + encoded;
// }
function getAuthHeader() {
  const merchantId = process.env.MERCHANT_ID;
  const password = process.env.MERCHANT_PASSWORD;

  if (!merchantId || !password) {
    throw new Error("MPGS merchant credentials are missing");
  }

  const trimmedMerchantId = merchantId.trim();
  const trimmedPassword = password.trim();

  // Try current format first
  const raw = `merchant.${trimmedMerchantId}:${trimmedPassword}`;
  const encoded = Buffer.from(raw).toString("base64");

  // 🔥 DEBUG LOGS
  console.log("========== MPGS AUTH DEBUG ==========");
  console.log("MERCHANT_ID RAW:", JSON.stringify(merchantId));
  console.log("MERCHANT_ID TRIMMED:", JSON.stringify(trimmedMerchantId));
  console.log("PASSWORD LENGTH:", trimmedPassword.length);
  console.log("PASSWORD FIRST/LAST CHAR CODES:", {
    first: trimmedPassword.charCodeAt(0),
    last: trimmedPassword.charCodeAt(trimmedPassword.length - 1),
  });
  console.log("AUTH RAW STRING:", raw); 
  console.log("AUTH BASE64:", encoded);
  console.log("BASE URL:", process.env.MPGS_BASE_URL);
  console.log("====================================");

  return "Basic " + encoded;
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
        url: "https://ayconnect.yalayis.org",
        logo: "https://ayconnect.yalayis.org/assets/yalayis_logo.png",
      },
      locale: "en_US",
      displayControl: {
        billingAddress: "HIDE",
        customerEmail: "HIDE",
        shipping: "HIDE",
      },
      returnUrl: `https://ayconnect.yalayis.org/payment/return?payment_type=${payment_type}&paymentId=${payment_id}`,
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

   
    throw new Error(
      `MPGS session error: ${
        err.response?.data
          ? JSON.stringify(err.response.data)
          : err.message
      }`
    );
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
