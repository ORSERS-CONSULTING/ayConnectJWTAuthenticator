const {
  ordsInitPayment,
  ordsUpdatePaymentSession,
  ordsUpdatePaymentStatus,
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
      // 1️⃣ Generate temporary reference
      const tempId = `${reference_id}`;

      // 2️⃣ Create MPGS orderId
      const orderId = `PARKING-${tempId}`;

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

    const { orderId, payment_type } = req.body;

    if (!orderId) {
      return res.status(400).json({
        message: "orderId is required",
      });
    }

    console.log("🌐 Fetching MPGS order...", orderId);

    const order = await retrieveOrder(orderId);

    console.log("📦 MPGS ORDER RESPONSE:", order);

    if (
      order?.result === "SUCCESS" &&
      (order?.status === "CAPTURED" || order?.status === "AUTHORIZED")
    ) {
      console.log("💰 Payment SUCCESS from MPGS");

      /* ========================= */
      /* ===== PARKING FLOW ====== */
      /* ========================= */

      if (payment_type === "PARKING") {
        const { plate_number, plate_category, plate_area_name } = req.body;

        if (!plate_number) {
          throw new Error("Missing plate_number for parking verification");
        }

        console.log("🚗 Fetching parking info...");

        const parking = await ordsGetParkingInfo({
          plate_number,
          plate_category,
          plate_area_name,
        });

        console.log("📦 Parking data:", parking);

        if (!parking?.ticketId) {
          throw new Error("No active parking session found");
        }

        // 🔴 IMPORTANT: prevent duplicate insert
        const alreadyPaid =
          parking.financials?.amountDue === 0 &&
          parking.financials?.isPayable === false;

        if (alreadyPaid) {
          console.log("⚠️ Payment already exists, skipping insert");
          return res.json({ status: "PAID" });
        }

       console.log("🧾 INSERT PAYLOAD:", {
  entry_guid: parking.ticketId,
  time_in: parking.timeEntered,
  time_spent_min: parking.durationMinutes,
  amount_paid: parking.financials?.amountDue ?? 0,
  center_fees_spent: parking.rules?.centreFeeUsedMinor ?? 0,
  minutes_free: parking.rules?.freeMinutesGranted ?? 0,
});

try {
  const insertRes = await ordsInsertParkingPayment({
    entry_guid: parking.ticketId,
    time_in: parking.timeEntered,
    time_spent_min: parking.durationMinutes,
    amount_paid: parking.financials?.amountDue ?? 0,
    center_fees_spent: parking.rules?.centreFeeUsedMinor ?? 0,
    minutes_free: parking.rules?.freeMinutesGranted ?? 0,
  });

  console.log("✅ Parking payment inserted:", insertRes);
} catch (err) {
  console.error("❌ INSERT FAILED:", err.message);
  console.error("❌ ORDS ERROR:", err.response?.data);
  throw err; // important so you see failure in response
}
        return res.json({ status: "PAID" });
      }

      /* ========================= */
      /* ===== SERVICE FLOW ====== */
      /* ========================= */

      const { paymentId } = req.body;

      if (!paymentId) {
        throw new Error("paymentId required for service payments");
      }

      await ordsUpdatePaymentStatus({
        payment_id: paymentId,
        status: "PAID",
        mpgs_transaction_id:
          order?.authentication?.["3ds"]?.transactionId || null,
        result_reason: order?.result || "UNKNOWN",
      });

      return res.json({ status: "PAID" });
    }
    console.log("⏳ Payment still pending");

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
