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
  amount_due: amount,
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
    const { paymentId, payment_type } = req.body;

    if (!paymentId || !payment_type) {
      return res.status(400).json({
        message: "paymentId and payment_type are required",
      });
    }

    let payment;

    if (payment_type === "PARKING") {
      payment = await ordsGetParkingPayment(paymentId);
    } else {
      payment = await ordsGetPayment(paymentId);
    }

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const currentStatus = payment.status || payment.payment_status;

    if (currentStatus === "PAID" || currentStatus === "FAILED") {
      return res.json({ status: currentStatus });
    }

    const order = await retrieveOrder(payment.mpgs_order_id);

    if (
      order?.result === "SUCCESS" &&
      (order?.status === "CAPTURED" || order?.status === "AUTHORIZED")
    ) {
      if (payment_type === "PARKING") {
        await ordsUpdateParkingStatus({
          payment_id: paymentId,
          payment_status: "PAID",
          amount_paid: payment.amount_paid || payment.amount,
          mpgs_txn_id: order?.authentication?.["3ds"]?.transactionId || null,
          deadline_to_leave: null,
        });
      } else {
        await ordsUpdatePaymentStatus({
          payment_id: paymentId,
          status: "PAID",
          mpgs_transaction_id:
            order?.authentication?.["3ds"]?.transactionId || null,
        });
      }

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
 * PAYMENT RETURN (browser → app)
 * ----------------------------------------------------
 * GET /payments/return
 */
async function paymentReturn(req, res) {
  try {
    // const { instance_svc_id } = req.query;

    // if (!instance_svc_id) {
    //   return res.status(400).send("Missing instance_svc_id");
    // }

    // ✅ Expo Router–correct deep link
    const deepLink = `ayconnect://requests`;

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
