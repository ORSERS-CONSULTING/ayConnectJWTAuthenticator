const {
  ordsInitPayment,
  ordsUpdatePaymentSession,
  ordsUpdatePaymentStatus,
  ordsGetPayment,
  ordsGetParkingInfo,
  ordsInsertParkingPayment,
  ordsInsertParkingPaymentMeta, // ✅ NEW
  ordsGetParkingPaymentMeta, // ✅ NEW
  ordsUpdateParkingPaymentMetaStatus, // ✅ NEW
} = require("../services/paymentServices");
const {
  initiateHostedCheckout,
  retrieveOrder,
} = require("../services/rakbankService");

/**
 * ----------------------------------------------------
 * INIT PAYMENT (ORDS + MPGS session ONLY)
 * ----------------------------------------------------fwebn
 * POST /payment/init
 */
async function initPayment(req, res) {
  try {
    const user_id = String(req.user?.id || "");
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

    /* ======================================================= */
    /* ==================== PARKING FLOW ===================== */
    /* ======================================================= */
    if (payment_type === "PARKING") {
      const traceId = `PARK-${Date.now()}`;

      try {
        const { plate_number, plate_category, plate_area_name } = req.body;

        if (!plate_number) {
          return res.status(400).json({
            message: "plate_number is required for parking",
          });
        }
        const parking = await ordsGetParkingInfo({
          plate_number,
          plate_category,
          plate_area_name,
        });
        

        if (!parking?.financials) {
          throw new Error("Unable to retrieve parking financial snapshot");
        }

        const lockedAmountDue = Number(parking.financials.amountDue || 0);

        if (lockedAmountDue <= 0) {
          return res.status(400).json({
            message:
              parking.financials.reasonNotPayable ||
              "Parking payment is not currently required",
          });
        }

        // 🔥 IMPORTANT:
        // Deadline is simulated NOW and becomes frozen once payment starts
        const lockedDeadline = parking.financials.deadlineToLeave;
        const lockedTimeIn = parking.timeEntered;

        // 2️⃣ Generate orderId
        const orderId = `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        await ordsInsertParkingPaymentMeta({
          order_id: orderId,
          entry_guid: reference_id,

          plate_number,
          plate_category,
          plate_area_name,

          locked_amount_due: lockedAmountDue,
          locked_time_spent_min: Number(parking.durationMinutes || 0),

          locked_center_fees_spent: Number(
            parking.rules?.centreFeeUsedMinor || 0,
          ),

          locked_minutes_free: Number(parking.rules?.freeMinutesGranted || 0),

          locked_deadline_to_leave: lockedDeadline,
          locked_time_in: lockedTimeIn,

          locked_is_valet: Number(parking.rules?.isValet || 0),

          // Optional but recommended accounting truth
          locked_gross_amount: Number(
            parking.financials.grossAmount || lockedAmountDue,
          ),

          locked_already_paid: Number(parking.financials.alreadyPaid || 0),
        });

        const { sessionId } = await initiateHostedCheckout({
          amount: lockedAmountDue,
          orderId,
          payment_type,
        });

        return res.status(200).json({
          paymentId: null,
          sessionId,
          orderId,

          // Optional frontend display
          lockedAmountDue,
          lockedDeadline,
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


async function verifyPayment(req, res) {
  const traceId = `VERIFY-${Date.now()}`;

  try {
    const { orderId, payment_type } = req.body;

    /* ======================================================= */
    /* ==================== PARKING FLOW ===================== */
    /* ======================================================= */
    if (payment_type === "PARKING") {
      try {
        if (!orderId) {
          console.warn(`⚠️ [${traceId}] Missing orderId`);
          return res.status(400).json({
            message: "orderId is required",
          });
        }

        // 🔥 1️⃣ GET FROZEN META SNAPSHOT
        const meta = await ordsGetParkingPaymentMeta({
          order_id: orderId,
        });

        if (!meta) {
          console.warn(`⚠️ [${traceId}] No meta found`);
          return res.json({ status: "PENDING" });
        }

        // 🔥 Already finalized
        if (meta.status === "SUCCESS") {
          return res.json({ status: "PAID" });
        }

        if (meta.status === "FAILED") {
          return res.json({ status: "FAILED" });
        }

        // 🔥 2️⃣ VERIFY MPGS STATUS
        const order = await retrieveOrder(orderId);

        const mpgsOrderStatus = order?.order?.status || order?.status;

        const mpgsResult = order?.result;

        const isCaptured =
          mpgsOrderStatus === "CAPTURED" && mpgsResult === "SUCCESS";

        const isFailed = ["FAILED", "CANCELLED", "DECLINED"].includes(
          mpgsOrderStatus,
        );

        /* =================================================== */
        /* ================= PAYMENT SUCCESS ================= */
        /* =================================================== */
        if (isCaptured) {
          const mpgsTransactionId =
            order?.transaction?.id ||
            order?.authentication?.["3ds"]?.transactionId ||
            order?.authentication?.["3ds2"]?.dsTransactionId ||
            null;

          const parkingInsertPayload = {
            entry_guid: meta.entry_guid,

            // 🔒 FROZEN SNAPSHOT
            locked_time_spent_min: meta.locked_time_spent_min,

            amount_paid: meta.locked_amount_due ?? 0,

            locked_center_fees_spent: meta.locked_center_fees_spent ?? 0,

            locked_minutes_free: meta.locked_minutes_free ?? 0,

            // 🔥 MPGS
            mpgs_order_id: orderId,
            mpgs_session_id: order?.session?.id || null,
            mpgs_txn_id: mpgsTransactionId,

            // 🔥 Locked financial state
            locked_deadline_to_leave: meta.locked_deadline_to_leave,

            locked_gross_amount: meta.locked_gross_amount,

            locked_already_paid: meta.locked_already_paid,
          };

          let insertResult = null;

          try {
            insertResult = await ordsInsertParkingPayment(parkingInsertPayload);
            if (
              !insertResult ||
              insertResult.status === "ERROR" ||
              insertResult.message?.includes("ORA-")
            ) {
              throw new Error(insertResult?.message || "Parking insert failed");
            }
          } catch (err) {
            if (err.message.includes("ORA-00001")) {
              console.log(`Duplicate insert skipped`);
            } else {
              console.error(`PARKING INSERT FAILED`, {
                message: err.message,
                status: err?.response?.status,
                data: err?.response?.data,
                stack: err.stack,
              });

              throw err;
            }
          }

          if (!insertResult) {
            console.warn(
              `⚠️ [${traceId}] Insert returned empty or duplicate response`,
            );
          }

          await ordsUpdateParkingPaymentMetaStatus({
            order_id: orderId,
            status: "SUCCESS",
          });

          return res.json({
            status: "PAID",
          });
        }

        /* =================================================== */
        /* ================= PAYMENT FAILED ================== */
        /* =================================================== */
        if (isFailed) {

          await ordsUpdateParkingPaymentMetaStatus({
            order_id: orderId,
            status: "FAILED",
          });

          return res.json({
            status: "FAILED",
          });
        }

        return res.json({
          status: "PENDING",
        });
      } catch (err) {
        console.error(`💥 [${traceId}] PARKING ERROR`, {
          message: err.message,
          status: err?.response?.status,
          data: err?.response?.data,
          stack: err.stack,
        });

        return res.status(500).json({
          message: err.message,
        });
      }
    }
    /* ========================= */
    /* ===== SERVICE FLOW ====== */
    /* ========================= */

    if (!orderId) {
      return res.status(400).json({ message: "orderId is required" });
    }

    const payment = await ordsGetPayment(orderId);

    if (!payment) {
      console.warn(`⚠️ [${traceId}] Service payment not found`);
      return res.status(404).json({ message: "Payment not found" });
    }

    const currentStatus = payment.status || payment.payment_status;

    if (currentStatus === "PAID") return res.json({ status: "PAID" });
    if (currentStatus === "FAILED") return res.json({ status: "FAILED" });

    const order = await retrieveOrder(orderId);

    const mpgsOrderStatus = order?.order?.status || order?.status;
    const mpgsResult = order?.result;

    const isCaptured =
      mpgsOrderStatus === "CAPTURED" && mpgsResult === "SUCCESS";

    const isFailed = ["FAILED", "CANCELLED", "DECLINED"].includes(
      mpgsOrderStatus,
    );

    if (isCaptured) {
      const mpgsTransactionId =
        order?.authentication?.["3ds"]?.transactionId ||
        order?.authentication?.["3ds2"]?.dsTransactionId ||
        order?.transaction?.id ||
        null;

      await ordsUpdatePaymentStatus({
        payment_id: payment.payment_id,
        status: "PAID",
        mpgs_transaction_id: mpgsTransactionId,
        result_reason: mpgsResult || "SUCCESS",
      });

      return res.json({ status: "PAID" });
    }

    if (isFailed) {
      await ordsUpdatePaymentStatus({
        payment_id: payment.payment_id,
        status: "FAILED",
        mpgs_transaction_id: null,
        result_reason: mpgsOrderStatus,
      });

      return res.json({ status: "FAILED" });
    }

    return res.json({ status: "PENDING" });
  } catch (e) {
    console.error(`💥 [${traceId}] VERIFY ERROR`, e.message);
    return res.status(500).json({ message: e.message });
  }
}

async function paymentWebhook(req, res) {
  try {
    const traceId = `WEBHOOK-${Date.now()}`;
    const secret = req.headers["x-notification-secret"];

    if (secret !== process.env.MPGS_WEBHOOK_SECRET) {
      console.warn(`❌ [${traceId}] Invalid webhook secret`);

      return res.sendStatus(401);
    }

    const { order, result, transaction } = req.body;

    const orderId = order?.id;

    // 🔥 Only process actual payment event
    if (transaction?.type !== "PAYMENT") {

      return res.sendStatus(200);
    }

    if (!orderId) {
      console.warn(`⚠️ [${traceId}] Missing orderId`);

      return res.sendStatus(400);
    }

    const isSuccess = order?.status === "CAPTURED";


    /* ======================================================= */
    /* ==================== PARKING FLOW ===================== */
    /* ======================================================= */
    if (orderId.startsWith("P-")) {

      const meta = await ordsGetParkingPaymentMeta({
        order_id: orderId,
      });


      if (!meta) {
        console.warn(`⚠️ [${traceId}] No parking meta found`);

        return res.sendStatus(200);
      }

      // 🔥 Already finalized
      if (meta.status === "SUCCESS") {

        return res.sendStatus(200);
      }

      const mpgsOrder = await retrieveOrder(orderId);

      const mpgsOrderStatus = mpgsOrder?.order?.status || mpgsOrder?.status;

      const mpgsResult = mpgsOrder?.result;

      const isCaptured =
        mpgsOrderStatus === "CAPTURED" && mpgsResult === "SUCCESS";

      const isFailed = ["FAILED", "CANCELLED", "DECLINED"].includes(
        mpgsOrderStatus,
      );

      /* =================================================== */
      /* ================= PAYMENT SUCCESS ================= */
      /* =================================================== */
      if (isCaptured) {
        const mpgsTransactionId =
          mpgsOrder?.transaction?.id ||
          mpgsOrder?.authentication?.["3ds"]?.transactionId ||
          mpgsOrder?.authentication?.["3ds2"]?.dsTransactionId ||
          null;


        const parkingInsertPayload = {
          entry_guid: meta.entry_guid,

          // 🔒 Frozen snapshot
          locked_time_spent_min: meta.locked_time_spent_min,

          amount_paid: meta.locked_amount_due ?? 0,

          locked_center_fees_spent: meta.locked_center_fees_spent ?? 0,

          locked_minutes_free: meta.locked_minutes_free ?? 0,

          // 🔥 MPGS
          mpgs_order_id: orderId,

          mpgs_session_id: mpgsOrder?.session?.id || null,

          mpgs_txn_id: mpgsTransactionId,

          // 🔥 Locked advanced fields
          locked_deadline_to_leave: meta.locked_deadline_to_leave,

          locked_gross_amount: meta.locked_gross_amount,

          locked_already_paid: meta.locked_already_paid,
        };

        let insertResult = null;

        try {
          insertResult = await ordsInsertParkingPayment(parkingInsertPayload);

          if (
            !insertResult ||
            insertResult.status === "ERROR" ||
            insertResult.message?.includes("ORA-")
          ) {
            throw new Error(
              insertResult?.message || "Parking insert failed"
            );
          }

        } catch (err) {
          if (err.message.includes("ORA-00001")) {
            console.log(`Duplicate insert skipped`);
          } else {
            console.error(`💥 [${traceId}] PARKING INSERT FAILED`, {
              message: err.message,
              status: err?.response?.status,
              data: err?.response?.data,
              stack: err.stack,
            });

            throw err;
          }
        }

        if (!insertResult) {
          console.warn(
            `⚠️ [${traceId}] Insert returned empty or duplicate response`,
          );
        }

        await ordsUpdateParkingPaymentMetaStatus({
          order_id: orderId,
          status: "SUCCESS",
        });

      } else if (isFailed) {

        /* =================================================== */
        /* ================= PAYMENT FAILED ================== */
        /* =================================================== */

        await ordsUpdateParkingPaymentMetaStatus({
          order_id: orderId,
          status: "FAILED",
        });
      }

      return res.sendStatus(200);
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
        const mpgsTransactionId =
          req.body?.authentication?.["3ds"]?.transactionId ||
          req.body?.authentication?.["3ds2"]?.dsTransactionId ||
          req.body?.transaction?.id;

        if (!mpgsTransactionId) {
          console.warn("⚠️ Missing MPGS transaction ID");
          return res.sendStatus(200);
        }

        if ((payment.status || payment.payment_status) === "PAID") {
          return res.sendStatus(200);
        }

        await ordsUpdatePaymentStatus({
          payment_id: payment.payment_id,
          status: "PAID",
          mpgs_transaction_id: mpgsTransactionId,
          result_reason: result,
        });
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("💥 [WEBHOOK ERROR]", err);
    return res.sendStatus(500);
  }
}
async function paymentReturn(req, res) {
  try {
    const { payment_type, orderId } = req.query;

    let deepLink;

    if (payment_type === "PARKING") {
      deepLink = orderId
        ? `ayconnect://parking/page?orderId=${encodeURIComponent(orderId)}`
        : `ayconnect://parking/page`;
    } else {
      deepLink = `ayconnect://requests`;
    }

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
  paymentWebhook,
};
