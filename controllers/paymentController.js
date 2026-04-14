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

        // ✅ GET META (to confirm exists)
        const meta = await ordsGetParkingPaymentMeta({
          order_id: orderId,
        });

        if (!meta) {
          console.warn(`⚠️ [${traceId}] No parking meta found`);
          return res.json({ status: "PENDING" });
        }

        // ✅ CHECK META STATUS (set by webhook)
        console.log(`📦 [${traceId}] META STATUS:`, meta.status);

        if (meta.status === "SUCCESS") {
          return res.json({ status: "PAID" });
        }

        if (meta.status === "FAILED") {
          return res.json({ status: "FAILED" });
        }

        return res.json({ status: "PENDING" });

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

    if (!orderId) {
      return res.status(400).json({
        message: "orderId is required",
      });
    }

    console.log("🔍 [VERIFY] Fetching service payment from ORDS...", orderId);

    const payment = await ordsGetPayment(orderId);

    if (!payment) {
      console.warn("⚠️ [VERIFY] Payment not found");
      return res.status(404).json({ message: "Payment not found" });
    }

    const currentStatus = payment.status || payment.payment_status;

    console.log("📦 [VERIFY RESULT]:", {
      orderId,
      status: currentStatus,
    });

    // ✅ JUST RETURN DB STATUS (webhook already updated it)
    return res.json({
      status: currentStatus,
    });

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
async function paymentWebhook(req, res) {
  try {
    console.log("📩 [WEBHOOK] Incoming:", req.body);

    const secret = req.headers["x-notification-secret"];

    if (secret !== process.env.MPGS_WEBHOOK_SECRET) {
      console.warn("❌ Invalid webhook secret");
      return res.sendStatus(401);
    }

    const { order, result, transaction } = req.body;
    const orderId = order?.id;

    if (!orderId) return res.sendStatus(400);
const isSuccess =
  order?.status === "CAPTURED";

console.log("🔍 [WEBHOOK CHECK]:", {
  result,
  orderStatus: order?.status,
});


    console.log("🔍 [WEBHOOK] Order:", orderId, "Success:", isSuccess);

    // =========================
    // PARKING FLOW
    // =========================
    if (orderId.startsWith("P-")) {
      const meta = await ordsGetParkingPaymentMeta({ order_id: orderId });

      if (!meta) {
        console.warn("⚠️ No parking meta found");
        return res.sendStatus(200);
      }

      if (isSuccess) {
        const parking = await ordsGetParkingInfo({
          plate_number: meta.plate_number,
          plate_category: meta.plate_category,
          plate_area_name: meta.plate_area_name,
        });

        await ordsInsertParkingPayment({
          entry_guid: meta.entry_guid,
          time_in: parking?.timeEntered,
          time_spent_min: parking?.durationMinutes,
          amount_paid: parking?.financials?.amountDue ?? 0,
          center_fees_spent: parking?.rules?.centreFeeUsedMinor ?? 0,
          minutes_free: parking?.rules?.freeMinutesGranted ?? 0,
        });

        await ordsUpdateParkingPaymentMetaStatus({
          order_id: orderId,
          status: "SUCCESS",
        });

        console.log("✅ [WEBHOOK] Parking payment processed");
      }
    }

    // =========================
    // SERVICE FLOW
    // =========================
    else {
      // 🔴 IMPORTANT: you need this ORDS function
      const payment = await ordsGetPayment(orderId);

      if (!payment) {
        console.warn("⚠️ No service payment found");
        return res.sendStatus(200);
      }

      if (isSuccess) {
        await ordsUpdatePaymentStatus({
          payment_id: payment.payment_id,
          status: "PAID",
          mpgs_transaction_id:
            transaction?.authentication?.["3ds"]?.transactionId || null,
          result_reason: result,
        });

        console.log("✅ [WEBHOOK] Service payment updated");
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("💥 [WEBHOOK ERROR]", err);
    return res.sendStatus(500);
  }
}
module.exports = {
  initPayment,
  verifyPayment,
  paymentReturn,
  paymentWebhook
};
