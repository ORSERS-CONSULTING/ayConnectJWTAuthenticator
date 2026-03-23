const {
  ordsInitPayment,
  ordsUpdatePaymentSession,
  ordsUpdatePaymentStatus,
  ordsGetPayment,
  ordsGetParkingPayment,
  ordsInitiateParkingPayment,
  ordsUpdateParkingSession,
  ordsUpdateParkingStatus,
} = require("../services/ordsServices");

const {
  initiateHostedCheckout,
  retrieveOrder,
} = require("../services/rakbankService");

/**
 * ----------------------------------------------------
 * INIT PAYMENT (ORDS + MPGS session ONLY)
 * ----------------------------------------------------
 * POST /payment/init
 */
async function initPayment(req, res) {
  try {
    // const user_id = req.user?.user_id || req.user?.id || req.user?.sub;
    // if (!user_id) {
    //   return res.status(401).json({ message: "Unauthorized" });
    // }
    const user_id = req.user?.user_id || req.user?.id || req.user?.sub || null;
    const { payment_type, reference_id, amount } = req.body;

    if (!payment_type || amount == null) {
      return res.status(400).json({
        message: "payment_type and amount are required",
      });
    }

    if (payment_type === "PARKING" && !reference_id) {
      return res.status(400).json({
        message: "entry_guid (reference_id) is required for parking",
      });
    }

    let ordsRes;

    if (payment_type === "PARKING") {
      ordsRes = await ordsInitiateParkingPayment({
        entry_guid: reference_id,
        plate_number: req.body.plate_number, // IMPORTANT
        time_in: req.body.time_in,
        time_spent_min: req.body.time_spent_min,
        amount: amount,
        center_fees_spent: req.body.center_fees_spent ?? 0,
        minutes_free: req.body.minutes_free ?? 0,
      });
    } else {
      ordsRes = await ordsInitPayment({
        user_id,
        payment_type,
        reference_id,
        amount,
      });
    }
    const payment_id = Number(
      ordsRes?.payment_id ??
        ordsRes?.data?.payment_id ??
        ordsRes?.data?.response_body?.payment_id,
    );

    if (!Number.isFinite(payment_id)) {
      throw new Error("ORDS did not return a valid payment_id");
    }

    // 2️⃣ Create MPGS order + session (NO returnUrl here ❗)
    const orderId = `${payment_type}-${payment_id}-${Date.now()}`;
    const { sessionId } = await initiateHostedCheckout({
      amount,
      orderId,
      payment_type,
      payment_id,
    });
    if (payment_type === "PARKING") {
      await ordsUpdateParkingSession({
        payment_id,
        mpgs_order_id: orderId,
        mpgs_session_id: sessionId,
      });
    } else {
      await ordsUpdatePaymentSession({
        payment_id,
        mpgs_order_id: orderId,
        mpgs_session_id: sessionId,
      });
    }
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
 * POST /payment/ver
 */
async function verifyPayment(req, res) {
  try {
    console.log("📥 [VERIFY] Incoming body:", req.body);

    let { paymentId, payment_type } = req.body;

    if (!paymentId) {
      console.warn("⚠️ Missing paymentId");
      return res.status(400).json({
        message: "paymentId is required",
      });
    }
    let payment;

    console.log("🔍 Fetching payment from ORDS...", {
      paymentId,
      payment_type,
    });

    // 🔥 AUTO-DETECT TYPE IF NOT PROVIDED
    if (!payment_type) {
      console.log("🤖 Auto-detecting payment type...");

      payment = await ordsGetPayment(paymentId);

      if (payment) {
        payment_type = "SERVICE";
      } else {
        payment = await ordsGetParkingPayment(paymentId);
        payment_type = "PARKING";
      }

      console.log("🧠 Detected type:", payment_type);
    } else {
      if (payment_type === "PARKING") {
        payment = await ordsGetParkingPayment(paymentId);
      } else {
        payment = await ordsGetPayment(paymentId);
      }
    }

    console.log("📦 ORDS PAYMENT RESPONSE:", payment);

    if (!payment) {
      console.warn("❌ Payment not found in ORDS");
      return res.status(404).json({ message: "Payment not found" });
    }

    const currentStatus = payment.status || payment.payment_status;

    console.log("📊 Current payment status:", currentStatus);

    if (currentStatus === "PAID" || currentStatus === "FAILED") {
      console.log("✅ Already final status:", currentStatus);
      return res.json({ status: currentStatus });
    }

    console.log("🌐 Fetching MPGS order...", payment.mpgs_order_id);

    const order = await retrieveOrder(payment.mpgs_order_id);

    console.log("📦 MPGS ORDER RESPONSE:", order);

    if (
      order?.result === "SUCCESS" &&
      (order?.status === "CAPTURED" || order?.status === "AUTHORIZED")
    ) {
      console.log("💰 Payment SUCCESS from MPGS");

      if (payment_type === "PARKING") {
        console.log("🚗 Updating parking payment status in ORDS...");

        await ordsUpdateParkingStatus({
          payment_id: paymentId,
          payment_status: "PAID",
          amount_paid: Number(payment.amount_paid || payment.amount || 0),
          mpgs_txn_id: order?.authentication?.["3ds"]?.transactionId || null,
        });
      } else {
        console.log("🧾 Updating service payment status in ORDS...");

        await ordsUpdatePaymentStatus({
          payment_id: paymentId,
          status: "PAID",
          mpgs_transaction_id:
            order?.authentication?.["3ds"]?.transactionId || null,
          result_reason: order?.result || "UNKNOWN",
        });
      }

      return res.json({ status: "PAID" });
    }

    console.log("⏳ Payment still pending");

    return res.json({ status: "PENDING" });
  } catch (e) {
    console.error("❌ [verifyPayment] ERROR FULL:", {
      message: e.message,
      response: e.response?.data,
      status: e.response?.status,
      stack: e.stack,
    });

    return res.status(500).json({
      message: e.message,
      details: e.response?.data || null,
    });
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
    const { payment_type, paymentId } = req.query;
    let deepLink;
    if (payment_type === "PARKING") {
      deepLink = paymentId
        ? `ayconnect://parking/result?paymentId=${paymentId}`
        : `ayconnect://parking/result`;
    } else {
      deepLink = `ayconnect://requests`;
    }
    console.log("🔁 Redirecting to:", deepLink);

    return res.redirect(deepLink);
  } catch (err) {
    console.error("[paymentReturn] ERROR", err);
    return res.status(500).send("Payment return failed");
  }
}
module.exports = {
  initPayment,
  verifyPayment,
  paymentReturn,
};
