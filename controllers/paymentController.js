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

/**
 * ----------------------------------------------------
 * INIT PAYMENT (create ORDS + MPGS session)
 * ----------------------------------------------------
 * POST /payments/init
 */
async function initPayment(req, res) {
  console.log("🔥 /payments/init HIT", {
    url: req.originalUrl,
    body: req.body,
    user: req.user,
  });
  try {
    const user_id = req.user?.user_id || req.user?.id || req.user?.sub;
    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { payment_type, reference_id, amount } = req.body;

    if (!payment_type || !reference_id || !amount) {
      return res.status(400).json({
        message: "payment_type, reference_id and amount are required",
      });
    }

    // 1️⃣ Create ORDS payment (PENDING)
    const ordsRes = await ordsInitPayment({
      user_id,
      payment_type,
      reference_id,
      amount,
    });
    console.log("🟡 ORDS RAW RESPONSE:", JSON.stringify(ordsRes, null, 2));

    const payment_id = ordsRes?.payment_id;

    if (!payment_id) {
      throw new Error("ORDS did not return payment_id");
    }

    // 2️⃣ Create MPGS session
    const orderId = `${payment_type}-${payment_id}-${Date.now()}`;

    const { sessionId } = await createCheckoutSession({
      amount,
      orderId,
      returnUrl: "https://test.yalayis.com/return",
    });

    // 3️⃣ Save MPGS session in ORDS
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
 * VERIFY PAYMENT (after checkout)
 * ----------------------------------------------------
 * POST /payments/verify
 */
async function verifyPayment(req, res) {
  try {
    const user_id = req.user?.user_id || req.user?.id || req.user?.sub;
    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { paymentId } = req.body;
    if (!paymentId) {
      return res.status(400).json({ message: "paymentId is required" });
    }

    const payment = await ordsGetPayment(paymentId);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    // 🔒 Ownership check
    if (Number(payment.user_id) !== Number(user_id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Idempotent response
    if (payment.status === "PAID" || payment.status === "FAILED") {
      return res.json({ status: payment.status });
    }

    // Ask MPGS (source of truth)
    const order = await retrieveOrder(payment.mpgs_order_id);
    const txns = order.transaction || [];

    const paymentTxn = txns.find(
      (t) => (t.transaction?.type || t.type) === "PAYMENT"
    );

    const txnResult = paymentTxn?.result;
    const txnId = paymentTxn?.transaction?.id ?? paymentTxn?.id ?? null;

    if (order.status === "CAPTURED" && txnResult === "SUCCESS") {
      await ordsUpdatePaymentStatus({
        payment_id: paymentId,
        status: "PAID",
        mpgs_transaction_id: txnId,
      });

      return res.json({ status: "PAID" });
    }

    return res.json({ status: "PENDING" });
  } catch (e) {
    console.error("[verifyPayment] ERROR", e.message);
    return res.status(500).json({ message: e.message });
  }
}

module.exports = {
  initPayment,
  verifyPayment,
};
