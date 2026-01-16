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
 * INIT PAYMENT (create ORDS + MPGS session)
 * ----------------------------------------------------
 * POST /payments/init
 */
async function initPayment(req, res) {
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

    const ordsRes = await ordsInitPayment({
      user_id,
      payment_type,
      reference_id,
      amount,
    });
    // console.log("🟡 ORDS RAW RESPONSE:", JSON.stringify(ordsRes, null, 2));

    const payment_id = Number(
      ordsRes?.payment_id ??
        ordsRes?.data?.payment_id ??
        ordsRes?.data?.response_body?.payment_id
    );

    // console.log("🟢 Normalized payment_id:", payment_id);

    if (!Number.isFinite(payment_id)) {
      throw new Error("ORDS did not return a valid payment_id");
    }

    const orderId = `${payment_type}-${payment_id}-${Date.now()}`;
    // console.log("🟡 Generated MPGS orderId:", orderId);
    const { sessionId } = await createCheckoutSession({
      amount,
      orderId,
      returnUrl: "https://google.com",
    });

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
  console.log("🔥 verifyPayment ENTERED", req.body);

  try {
    const { paymentId } = req.body;
    if (!paymentId) {
      return res.status(400).json({ message: "paymentId is required" });
    }

    const payment = await ordsGetPayment(paymentId);
    console.log("🟡 ORDS payment:", payment);

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    // idempotency
    if (payment.status === "PAID" || payment.status === "FAILED") {
      return res.json({ status: payment.status });
    }

    // MPGS verification (we’ll refine this next)
    const order = await retrieveOrder(payment.mpgs_order_id);
    console.log("🟡 MPGS order:", order);

    if (order.status === "CAPTURED") {
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

async function serveCheckoutPage(req, res) {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).send("Missing sessionId");
    }

    const filePath = path.join(__dirname, "../views/mpgs-checkout.html");

    let html = fs.readFileSync(filePath, "utf8");
    html = html.replace("{{SESSION_ID}}", sessionId);

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("[serveCheckoutPage] ERROR", err);
    res.status(500).send("Unable to load payment page");
  }
}
module.exports = {
  initPayment,
  verifyPayment,
  serveCheckoutPage,
};
