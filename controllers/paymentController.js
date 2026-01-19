const {
  ordsInitPayment,
  ordsUpdatePaymentSession,
  ordsUpdatePaymentStatus,
  ordsGetPayment,
} = require("../services/ordsServices");

const {
  createCheckoutSession,
  retrieveOrder,
} = require("../services/rakbankService");

const fs = require("fs");
const path = require("path");

/**
 * ----------------------------------------------------
 * INIT PAYMENT (ORDS + MPGS session ONLY)
 * ----------------------------------------------------
 * POST /payment/init
 */
async function initPayment(req, res) {
  try {
    const user_id = req.user?.user_id || req.user?.id || req.user?.sub;
    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { payment_type, reference_id, amount } = req.body;

    if (!payment_type || !reference_id || amount == null) {
      return res.status(400).json({
        message: "payment_type, reference_id and amount are required",
      });
    }

    // 1️⃣ Create payment record in ORDS
    const ordsRes = await ordsInitPayment({
      user_id,
      payment_type,
      reference_id,
      amount,
    });

    const payment_id = Number(
      ordsRes?.payment_id ??
        ordsRes?.data?.payment_id ??
        ordsRes?.data?.response_body?.payment_id
    );

    if (!Number.isFinite(payment_id)) {
      throw new Error("ORDS did not return a valid payment_id");
    }

    // 2️⃣ Create MPGS order + session (NO returnUrl here ❗)
    const orderId = `${payment_type}-${payment_id}-${Date.now()}`;

    const { sessionId } = await createCheckoutSession({
      amount,
      orderId,
    });

    // 3️⃣ Store MPGS identifiers
    await ordsUpdatePaymentSession({
      payment_id,
      mpgs_order_id: orderId,
      mpgs_session_id: sessionId,
    });

    return res.status(200).json({
      paymentId: payment_id,
      sessionId,
    });
  } catch (e) {
    console.error("[initPayment] ERROR", e.message);
    return res.status(500).json({ message: e.message });
  }
}

/**
 * ----------------------------------------------------
 * VERIFY PAYMENT (after return)
 * ----------------------------------------------------
 * POST /payment/verify
 */
async function verifyPayment(req, res) {
  try {
    const { paymentId } = req.body;

    if (!paymentId) {
      return res.status(400).json({ message: "paymentId is required" });
    }

    const payment = await ordsGetPayment(paymentId);

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    // Idempotency
    if (payment.status === "PAID" || payment.status === "FAILED") {
      return res.json({ status: payment.status });
    }

    // MPGS verification
    const order = await retrieveOrder(payment.mpgs_order_id);

    if (order?.status === "CAPTURED") {
      await ordsUpdatePaymentStatus({
        payment_id: paymentId,
        status: "PAID",
        mpgs_transaction_id: order?.transaction?.[0]?.id ?? null,
      });

      return res.json({ status: "PAID" });
    }

    return res.json({ status: "PENDING" });
  } catch (e) {
    console.error("[verifyPayment] ERROR", e);
    return res.status(500).json({ message: e.message });
  }
}

/**
 * ----------------------------------------------------
 * SERVE CHECKOUT PAGE (inject returnUrl)
 * ----------------------------------------------------
 * GET /payment/checkout
 */
async function serveCheckoutPage(req, res) {
  try {
    const { sessionId, instance_svc_id } = req.query;

    console.log("🧪 /payment/checkout called");
    console.log("🧪 sessionId:", sessionId);

    // 🔴 FORCE HTTPS RETURN URL
    const returnUrl =
      `https://ameryon.com/payments/return?instance_svc_id=${instance_svc_id}`;

    console.log("🧪 FORCED returnUrl:", returnUrl);

    const filePath = path.join(__dirname, "../views/mpgs-checkout.html");
    let html = fs.readFileSync(filePath, "utf8");

    html = html
      .replace(/{{SESSION_ID}}/g, sessionId)
      .replace(/{{RETURN_URL}}/g, returnUrl)
      .replace(/{{AMOUNT}}/g, "10.00"); // temp hardcode if needed

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("[serveCheckoutPage] ERROR", err);
    res.status(500).send("Unable to load payment page");
  }
}


/**
 * ----------------------------------------------------
 * PAYMENT RETURN (browser → app)
 * ----------------------------------------------------
 * GET /payments/return
 */
async function paymentReturn(req, res) {
  try {
    const { instance_svc_id } = req.query;

    if (!instance_svc_id) {
      return res.status(400).send("Missing instance_svc_id");
    }

    // ✅ Expo Router–correct deep link
    const deepLink = `ayconnect://requests?instance_svc_id=${instance_svc_id}`;

    return res.redirect(deepLink);
  } catch (err) {
    console.error("[paymentReturn] ERROR", err);
    return res.status(500).send("Payment return failed");
  }
}

module.exports = {
  initPayment,
  verifyPayment,
  serveCheckoutPage,
  paymentReturn,
};
