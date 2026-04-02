const {
  ordsInitPayment,
  ordsUpdatePaymentSession,
  ordsUpdatePaymentStatus,
  ordsGetPayment,
  ordsGetParkingInfo,
  ordsInsertParkingPayment,
  ordsInsertParkingPaymentMeta,        // ✅ NEW
  ordsGetParkingPaymentMeta,           // ✅ NEW
  ordsUpdateParkingPaymentMetaStatus,  // ✅ NEW
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
  const traceId = `PARK-${Date.now()}`;

  try {
    const {
      plate_number,
      plate_category,
      plate_area_name,
    } = req.body;

    console.log(`🚀 [${traceId}] INIT PARKING START`);
    console.log(`📥 [${traceId}] Incoming body:`, req.body);

    if (!plate_number) {
      console.warn(`⚠️ [${traceId}] Missing plate_number`);
      return res.status(400).json({
        message: "plate_number is required for parking",
      });
    }

    // 1️⃣ Generate orderId
    const orderId = `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    console.log(`🆔 [${traceId}] Generated orderId:`, orderId);

    // 2️⃣ INSERT META
    console.log(`📡 [${traceId}] Calling ORDS insertParkingPaymentMeta...`);

    const startMeta = Date.now();

    let metaRes;
    try {
      metaRes = await ordsInsertParkingPaymentMeta({
        order_id: orderId,
        entry_guid: reference_id,
        plate_number,
        plate_category,
        plate_area_name,
      });

      console.log(`✅ [${traceId}] ORDS META SUCCESS`, {
        duration: `${Date.now() - startMeta}ms`,
        response: metaRes,
      });
    } catch (err) {
      console.error(`❌ [${traceId}] ORDS META FAILED`, {
        duration: `${Date.now() - startMeta}ms`,
        error: err?.message,
        details: err?.response?.data || null,
      });
      throw err;
    }

    // 3️⃣ MPGS SESSION
    console.log(`💳 [${traceId}] Creating MPGS session...`);

    const startMpgs = Date.now();

    const { sessionId } = await initiateHostedCheckout({
      amount,
      orderId,
      payment_type,
    });

    console.log(`✅ [${traceId}] MPGS SESSION CREATED`, {
      duration: `${Date.now() - startMpgs}ms`,
      sessionId,
    });

    console.log(`🏁 [${traceId}] INIT PARKING COMPLETE`);

    return res.status(200).json({
      paymentId: null,
      sessionId,
      orderId,
    });

  } catch (err) {
    console.error(`💥 [${traceId}] INIT PARKING ERROR`, {
      message: err.message,
      details: err?.response?.data || null,
      stack: err.stack,
    });

    return res.status(500).json({
      message: err.message,
      traceId,
    });
  }
}

    /* ========================= */
    /* ===== SERVICE FLOW ====== */
    /* ========================= */
    if (payment_type !== "PARKING" && !user_id) {
      return res.status(401).json({
        message: "Authentication required for service payments",
      });
    }

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
  const traceId = `VERIFY-PARK-${Date.now()}`;

  try {
    console.log(`🚀 [${traceId}] VERIFY PARKING START`);
    console.log(`📥 [${traceId}] Incoming body:`, req.body);

    if (!orderId) {
      console.warn(`⚠️ [${traceId}] Missing orderId`);
      return res.status(400).json({
        message: "orderId is required for parking",
      });
    }

    // =========================
    // 1️⃣ MPGS VERIFY
    // =========================
    console.log(`🌐 [${traceId}] Fetching MPGS order...`, orderId);

    const startMpgs = Date.now();
    let order;

    try {
      order = await retrieveOrder(orderId);

      console.log(`✅ [${traceId}] MPGS RESPONSE`, {
        duration: `${Date.now() - startMpgs}ms`,
        result: order?.result,
        status: order?.status,
        amount: order?.amount,
      });
    } catch (err) {
      console.error(`❌ [${traceId}] MPGS FAILED`, {
        duration: `${Date.now() - startMpgs}ms`,
        error: err.message,
        details: err?.response?.data || null,
      });
      throw err;
    }

    const isSuccess =
      order?.result === "SUCCESS" &&
      (order?.status === "CAPTURED" || order?.status === "AUTHORIZED");

    if (!isSuccess) {
      console.log(`⏳ [${traceId}] PAYMENT NOT COMPLETED`, {
        result: order?.result,
        status: order?.status,
      });
      return res.json({ status: "PENDING" });
    }

    // =========================
    // 2️⃣ GET META
    // =========================
    console.log(`📡 [${traceId}] Fetching META for orderId...`);

    let meta;
    const startMeta = Date.now();

    try {
meta = await ordsGetParkingPaymentMeta({
  order_id: orderId,
});
      console.log(`✅ [${traceId}] META RESPONSE`, {
        duration: `${Date.now() - startMeta}ms`,
        meta,
        orderId,
      });
    } catch (err) {
      console.error(`❌ [${traceId}] META FETCH FAILED`, {
        duration: `${Date.now() - startMeta}ms`,
        error: err.message,
        details: err?.response?.data || null,
      });
      throw err;
    }

    if (!meta) {
      throw new Error("Parking payment meta not found");
    }

    // =========================
    // 3️⃣ FETCH PARKING INFO
    // =========================
    console.log(`🚗 [${traceId}] Fetching parking info...`);

    let parking;
    const startParking = Date.now();

    try {
      parking = await ordsGetParkingInfo({
        plate_number: meta.plate_number,
        plate_category: meta.plate_category,
        plate_area_name: meta.plate_area_name,
      });

      console.log(`✅ [${traceId}] PARKING INFO`, {
        duration: `${Date.now() - startParking}ms`,
        ticketId: parking?.ticketId,
        amountDue: parking?.financials?.amountDue,
      });
    } catch (err) {
      console.error(`❌ [${traceId}] PARKING FETCH FAILED`, {
        duration: `${Date.now() - startParking}ms`,
        error: err.message,
        details: err?.response?.data || null,
      });
      throw err;
    }

    // =========================
    // 4️⃣ FINAL INSERT
    // =========================
    console.log(`💾 [${traceId}] Inserting final parking payment...`);

    const startInsert = Date.now();

    try {
      await ordsInsertParkingPayment({
        entry_guid: meta.entry_guid,
        time_in: parking?.timeEntered,
        time_spent_min: parking?.durationMinutes,
        amount_paid: parking?.financials?.amountDue ?? 0,
        center_fees_spent: parking?.rules?.centreFeeUsedMinor ?? 0,
        minutes_free: parking?.rules?.freeMinutesGranted ?? 0,
      });

      console.log(`✅ [${traceId}] INSERT SUCCESS`, {
        duration: `${Date.now() - startInsert}ms`,
      });
    } catch (err) {
      console.error(`❌ [${traceId}] INSERT FAILED`, {
        duration: `${Date.now() - startInsert}ms`,
        error: err.message,
        details: err?.response?.data || null,
      });
      throw err;
    }

    // =========================
    // 5️⃣ UPDATE META
    // =========================
    console.log(`🔄 [${traceId}] Updating META status...`);

    const startUpdate = Date.now();

    try {
      await ordsUpdateParkingPaymentMetaStatus({
        order_id: orderId,
        status: "SUCCESS",
      });

      console.log(`✅ [${traceId}] META UPDATED`, {
        duration: `${Date.now() - startUpdate}ms`,
      });
    } catch (err) {
      console.error(`❌ [${traceId}] META UPDATE FAILED`, {
        duration: `${Date.now() - startUpdate}ms`,
        error: err.message,
        details: err?.response?.data || null,
      });
      throw err;
    }

    console.log(`🏁 [${traceId}] VERIFY PARKING COMPLETE`);

    return res.json({ status: "PAID" });

  } catch (err) {
    console.error(`💥 [${traceId}] VERIFY PARKING ERROR`, {
      message: err.message,
      details: err?.response?.data || null,
      stack: err.stack,
    });

    return res.status(500).json({
      message: err.message,
      traceId,
    });
  }
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
      console.log("hello harsh;")
      console.log("🚨 [UPDATE PAYMENT PAYLOAD]", paymentId, "PAID",  order?.authentication?.["3ds"]?.transactionId || null, order?.result || "UNKNOWN");
        console.log("bye harsh;")

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
        ? `ayconnect://parking/page?orderId=${orderId}&plate=${plate_number}&plate_category=${plate_category}&plate_area_name=${plate_area_name}`
        : `ayconnect://parking/page`;
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
