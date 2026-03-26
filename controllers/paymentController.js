const {
  ordsInitPayment,
  ordsUpdatePaymentSession,
  ordsUpdatePaymentStatus,
  ordsGetPayment,
  ordsGetParkingInfo,
  ordsInsertParkingPayment,
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

    /* ========================= */
    /* ===== PARKING FLOW ====== */
    /* ========================= */

    if (payment_type === "PARKING") {
      // ❌ NO DB INSERT HERE
      const orderId = `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // 3️⃣ Create MPGS session
      const { sessionId } = await initiateHostedCheckout({
        amount,
        orderId,
        payment_type,
        // ❌ no payment_id anymore
      });

      // 4️⃣ Return session + orderId (important for verify step)
      return res.status(200).json({
        paymentId: null, // no DB record yet
        sessionId,
        orderId,
      });
    }

    /* ========================= */
    /* ===== SERVICE FLOW ====== */
    /* ========================= */

    let ordsRes;

    ordsRes = await ordsInitPayment({
      user_id,
      payment_type,
      reference_id,
      amount,
    });

    const payment_id = Number(
      ordsRes?.payment_id ??
        ordsRes?.data?.payment_id ??
        ordsRes?.data?.response_body?.payment_id,
    );

    if (!Number.isFinite(payment_id)) {
      throw new Error("ORDS did not return a valid payment_id");
    }

    const orderId = `${payment_type}-${payment_id}-${Date.now()}`;

    const { sessionId } = await initiateHostedCheckout({
      amount,
      orderId,
      payment_type,
      payment_id,
    });

    await ordsUpdatePaymentSession({
      payment_id,
      mpgs_order_id: orderId,
      mpgs_session_id: sessionId,
    });

    return res.status(200).json({
      paymentId: payment_id,
      sessionId,
      orderId,
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

    const {
      orderId,
      payment_type,
      paymentId,
      plate_number,
      plate_category,
      plate_area_name,
    } = req.body;

    /* ========================= */
    /* ===== PARKING FLOW ====== */
    /* ========================= */

    if (payment_type === "PARKING") {
      if (!orderId) {
        return res.status(400).json({
          message: "orderId is required for parking",
        });
      }

      console.log("🌐 Fetching MPGS order...", orderId);

      const order = await retrieveOrder(orderId);

      const isSuccess =
        order?.result === "SUCCESS" &&
        (order?.status === "CAPTURED" || order?.status === "AUTHORIZED");

      if (!isSuccess) {
        return res.json({ status: "PENDING" });
      }

      if (!plate_number) {
        throw new Error("Missing plate_number for parking verification");
      }

      console.log("🚗 Fetching parking info...");

      const parking = await ordsGetParkingInfo({
        plate_number,
        plate_category,
        plate_area_name,
      });

      if (!parking?.ticketId) {
        throw new Error("No active parking session found");
      }

      const alreadyPaid =
        parking.financials?.amountDue === 0 &&
        parking.financials?.isPayable === false;

      if (alreadyPaid) {
        return res.json({ status: "PAID" });
      }

      await ordsInsertParkingPayment({
        entry_guid: parking.ticketId,
        time_in: parking.timeEntered,
        time_spent_min: parking.durationMinutes,
        amount_paid: parking.financials?.amountDue ?? 0,
        center_fees_spent: parking.rules?.centreFeeUsedMinor ?? 0,
        minutes_free: parking.rules?.freeMinutesGranted ?? 0,
      });

      return res.json({ status: "PAID" });
    }

    /* ========================= */
    /* ===== SERVICE FLOW ====== */
    /* ========================= */

    if (!paymentId) {
      return res.status(400).json({
        message: "paymentId is required for service payments",
      });
    }

    console.log("🔍 Fetching service payment from ORDS...", paymentId);

    const payment = await ordsGetPayment(paymentId);

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const currentStatus = payment.status || payment.payment_status;

    if (currentStatus === "PAID" || currentStatus === "FAILED") {
      return res.json({ status: currentStatus });
    }

    console.log("🌐 Fetching MPGS order from ORDS...", payment.mpgs_order_id);

    const order = await retrieveOrder(payment.mpgs_order_id);

    const isSuccess =
      order?.result === "SUCCESS" &&
      (order?.status === "CAPTURED" || order?.status === "AUTHORIZED");
    if (isSuccess) {
      await ordsUpdatePaymentStatus({
        payment_id: paymentId,
        status: "PAID",
        mpgs_transaction_id:
          order?.authentication?.["3ds"]?.transactionId || null,
        result_reason: order?.result || "UNKNOWN", // ✅ FIX
      });

      return res.json({ status: "PAID" });
    }

    return res.json({ status: "PENDING" });
  } catch (e) {
    console.error("❌ [verifyPayment] ERROR:", e);
    return res.status(500).json({
      message: e.message,
      details: e.response?.data || null,
    });
  }
}
async function paymentReturn(req, res) {
  try {
    const {
      payment_type,
      orderId,
      plate_number,
      plate_category,
      plate_area_name,
    } = req.query;

    let deepLink;

    if (payment_type === "PARKING") {
      deepLink = orderId
        ? `ayconnect://parking/result?orderId=${orderId}&plate=${plate_number}&plate_category=${plate_category}&plate_area_name=${plate_area_name}`
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
