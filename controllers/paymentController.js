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
} = require("../services/ordsServices");
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
  // try {
  //   const user_id = req.user?.user_id || req.user?.id || req.user?.sub || null;

  //   const { payment_type, reference_id, amount } = req.body;

  //   if (!payment_type || amount == null) {
  //     return res.status(400).json({
  //       message: "payment_type and amount are required",
  //     });
  //   }
  //   if (payment_type === "PARKING" && !reference_id) {
  //     return res.status(400).json({
  //       message: "entry_guid (reference_id) is required for parking",
  //     });
  //   }

  //   if (payment_type === "PARKING") {
  //     const traceId = `PARK-${Date.now()}`;

  //     try {
  //       const { plate_number, plate_category, plate_area_name } = req.body;

  //       if (!plate_number) {
  //         console.warn(`⚠️ [${traceId}] Missing plate_number`);
  //         return res.status(400).json({
  //           message: "plate_number is required for parking",
  //         });
  //       }

  //       // 1️⃣ Generate orderId
  //       const orderId = `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  //       const startMeta = Date.now();

  //       let metaRes;
  //       try {
  //         metaRes = await ordsInsertParkingPaymentMeta({
  //           order_id: orderId,
  //           entry_guid: reference_id,
  //           plate_number,
  //           plate_category,
  //           plate_area_name,
  //         });

  //       } catch (err) {
  //         console.error(`❌ [${traceId}] ORDS META FAILED`, {
  //           duration: `${Date.now() - startMeta}ms`,
  //           error: err?.message,
  //           details: err?.response?.data || null,
  //         });
  //         throw err;
  //       }

  //       const startMpgs = Date.now();

  //       const { sessionId } = await initiateHostedCheckout({
  //         amount,
  //         orderId,
  //         payment_type,
  //       });

  //       return res.status(200).json({
  //         paymentId: null,
  //         sessionId,
  //         orderId,
  //       });
  //     } catch (err) {
  //       console.error(`💥 [${traceId}] INIT PARKING ERROR`, {
  //         message: err.message,
  //         details: err?.response?.data || null,
  //         stack: err.stack,
  //       });

  //       return res.status(500).json({
  //         message: err.message,
  //         traceId,
  //       });
  //     }
  //   }

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

    /* ======================================================= */
    /* ==================== PARKING FLOW ===================== */
    /* ======================================================= */
    if (payment_type === "PARKING") {
      const traceId = `PARK-${Date.now()}`;

      try {
        const { plate_number, plate_category, plate_area_name } = req.body;

        if (!plate_number) {
          console.warn(`⚠️ [${traceId}] Missing plate_number`);
          return res.status(400).json({
            message: "plate_number is required for parking",
          });
        }

        // 🔥 1️⃣ FINAL SNAPSHOT BEFORE PAYMENT
        // This is the ONLY final pricing truth before checkout
        console.log(
          `🚗 [${traceId}] Fetching final parking snapshot before checkout...`,
        );

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

        // 🔥 3️⃣ STORE FROZEN SNAPSHOT IN META
        console.log(`🧾 [${traceId}] Freezing parking snapshot into meta...`);

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

        // 🔥 4️⃣ MPGS MUST USE LOCKED AMOUNT
        console.log(
          `💳 [${traceId}] Initiating checkout with frozen amount: AED ${lockedAmountDue}`,
        );

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

/**
 * ----------------------------------------------------
 * VERIFY PAYMENT (after return)
 * ----------------------------------------------------
 * POST /payment/ver
 */
// async function verifyPayment(req, res) {
//   try {
//     console.log("📥 [VERIFY] Incoming body:", req.body);

//     const {
//       orderId,
//       payment_type,
//     } = req.body;

//     /* ========================= */
//     /* ===== PARKING FLOW ====== */
//     /* ========================= */

//     if (payment_type === "PARKING") {
//       const traceId = `VERIFY-PARK-${Date.now()}`;

//       try {
//         console.log(`🚀 [${traceId}] VERIFY PARKING START`);
//         console.log(`📥 [${traceId}] Incoming body:`, req.body);

//         if (!orderId) {
//           console.warn(`⚠️ [${traceId}] Missing orderId`);
//           return res.status(400).json({
//             message: "orderId is required for parking",
//           });
//         }

//         // ✅ GET META (to confirm exists)
//         const meta = await ordsGetParkingPaymentMeta({
//           order_id: orderId,
//         });

//         if (!meta) {
//           console.warn(`⚠️ [${traceId}] No parking meta found`);
//           return res.json({ status: "PENDING" });
//         }

//         // ✅ CHECK META STATUS (set by webhook)
//         console.log(`📦 [${traceId}] META STATUS:`, meta.status);

//         if (meta.status === "SUCCESS") {
//           return res.json({ status: "PAID" });
//         }

//         if (meta.status === "FAILED") {
//           return res.json({ status: "FAILED" });
//         }

//         return res.json({ status: "PENDING" });

//       } catch (err) {
//         console.error(`💥 [${traceId}] VERIFY PARKING ERROR`, {
//           message: err.message,
//           details: err?.response?.data || null,
//           stack: err.stack,
//         });

//         return res.status(500).json({
//           message: err.message,
//           traceId,
//         });
//       }
//     }

//     /* ========================= */
//     /* ===== SERVICE FLOW ====== */
//     /* ========================= */

//     if (!orderId) {
//       return res.status(400).json({
//         message: "orderId is required",
//       });
//     }

//     console.log("🔍 [VERIFY] Fetching service payment from ORDS...", orderId);

//     const payment = await ordsGetPayment(orderId);

//     if (!payment) {
//       console.warn("⚠️ [VERIFY] Payment not found");
//       return res.status(404).json({ message: "Payment not found" });
//     }

//     const currentStatus = payment.status || payment.payment_status;

//     console.log("📦 [VERIFY RESULT]:", {
//       orderId,
//       status: currentStatus,
//     });

//     // ✅ JUST RETURN DB STATUS (webhook already updated it)
//     return res.json({
//       status: currentStatus,
//     });

//   } catch (e) {
//     console.error("❌ [verifyPayment] ERROR:", e);
//     return res.status(500).json({
//       message: e.message,
//       details: e.response?.data || null,
//     });
//   }
// }

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

        console.log(
          `🚗 [${traceId}] Starting parking payment verification for orderId: ${orderId}`,
        );

        // 🔥 1️⃣ GET FROZEN META SNAPSHOT
        const meta = await ordsGetParkingPaymentMeta({
          order_id: orderId,
        });

        console.log(
          `🧾 [${traceId}] META SNAPSHOT:`,
          JSON.stringify(meta, null, 2),
        );

        if (!meta) {
          console.warn(`⚠️ [${traceId}] No meta found`);
          return res.json({ status: "PENDING" });
        }

        // 🔥 Already finalized
        if (meta.status === "SUCCESS") {
          console.log(`✅ [${traceId}] Meta already SUCCESS`);
          return res.json({ status: "PAID" });
        }

        if (meta.status === "FAILED") {
          console.log(`❌ [${traceId}] Meta already FAILED`);
          return res.json({ status: "FAILED" });
        }

        // 🔥 2️⃣ VERIFY MPGS STATUS
        const order = await retrieveOrder(orderId);

        console.log(
          `💳 [${traceId}] MPGS ORDER RESPONSE:`,
          JSON.stringify(order, null, 2),
        );

        const mpgsOrderStatus = order?.order?.status || order?.status;

        const mpgsResult = order?.result;

        const isCaptured =
          mpgsOrderStatus === "CAPTURED" && mpgsResult === "SUCCESS";

        const isFailed = ["FAILED", "CANCELLED", "DECLINED"].includes(
          mpgsOrderStatus,
        );

        console.log(`📊 [${traceId}] Payment Status Check`, {
          mpgsOrderStatus,
          mpgsResult,
          isCaptured,
          isFailed,
        });

        /* =================================================== */
        /* ================= PAYMENT SUCCESS ================= */
        /* =================================================== */
        if (isCaptured) {
          const mpgsTransactionId =
            order?.transaction?.id ||
            order?.authentication?.["3ds"]?.transactionId ||
            order?.authentication?.["3ds2"]?.dsTransactionId ||
            null;

          console.log(
            `💾 [${traceId}] Using frozen meta snapshot (NO RECALCULATION)`,
          );

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

          console.log(
            `🚨 [${traceId}] FINAL PARKING INSERT PAYLOAD:`,
            JSON.stringify(parkingInsertPayload, null, 2),
          );

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
            console.log(
              `✅ [${traceId}] PARKING INSERT SUCCESS RESPONSE:`,
              JSON.stringify(insertResult, null, 2),
            );
          } catch (err) {
            if (err.message.includes("ORA-00001")) {
              console.log(`⏭️ [${traceId}] Duplicate insert skipped`);
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

          // 🔥 4️⃣ MARK META SUCCESS
          console.log(`🟢 [${traceId}] Updating meta status to SUCCESS`);

          await ordsUpdateParkingPaymentMetaStatus({
            order_id: orderId,
            status: "SUCCESS",
          });

          console.log(`🏁 [${traceId}] Parking payment fully verified`);

          return res.json({
            status: "PAID",
          });
        }

        /* =================================================== */
        /* ================= PAYMENT FAILED ================== */
        /* =================================================== */
        if (isFailed) {
          console.log(`❌ [${traceId}] Payment marked FAILED`);

          await ordsUpdateParkingPaymentMetaStatus({
            order_id: orderId,
            status: "FAILED",
          });

          return res.json({
            status: "FAILED",
          });
        }

        /* =================================================== */
        /* ================= STILL PENDING =================== */
        /* =================================================== */
        console.log(`⏳ [${traceId}] Payment still pending`);

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

    console.log(`📩 [${traceId}] Incoming webhook received`);

    if (secret !== process.env.MPGS_WEBHOOK_SECRET) {
      console.warn(`❌ [${traceId}] Invalid webhook secret`);

      return res.sendStatus(401);
    }

    const { order, result, transaction } = req.body;

    const orderId = order?.id;

    console.log(
      `📦 [${traceId}] Webhook Payload:`,
      JSON.stringify(req.body, null, 2),
    );

    // 🔥 Only process actual payment event
    if (transaction?.type !== "PAYMENT") {
      console.log(
        `⏭️ [${traceId}] Ignored non-payment webhook type: ${transaction?.type}`,
      );

      return res.sendStatus(200);
    }

    if (!orderId) {
      console.warn(`⚠️ [${traceId}] Missing orderId`);

      return res.sendStatus(400);
    }

    const isSuccess = order?.status === "CAPTURED";

    console.log(`📊 [${traceId}] Basic Webhook Status`, {
      orderId,
      orderStatus: order?.status,
      result,
      isSuccess,
    });

    /* ======================================================= */
    /* ==================== PARKING FLOW ===================== */
    /* ======================================================= */
    if (orderId.startsWith("P-")) {
      console.log(`🚗 [${traceId}] Processing parking payment webhook`);

      const meta = await ordsGetParkingPaymentMeta({
        order_id: orderId,
      });

      console.log(
        `🧾 [${traceId}] META SNAPSHOT:`,
        JSON.stringify(meta, null, 2),
      );

      if (!meta) {
        console.warn(`⚠️ [${traceId}] No parking meta found`);

        return res.sendStatus(200);
      }

      // 🔥 Already finalized
      if (meta.status === "SUCCESS") {
        console.log(`✅ [${traceId}] Meta already SUCCESS — skipping`);

        return res.sendStatus(200);
      }

      const mpgsOrder = await retrieveOrder(orderId);

      console.log(
        `💳 [${traceId}] MPGS ORDER RESPONSE:`,
        JSON.stringify(mpgsOrder, null, 2),
      );

      const mpgsOrderStatus = mpgsOrder?.order?.status || mpgsOrder?.status;

      const mpgsResult = mpgsOrder?.result;

      const isCaptured =
        mpgsOrderStatus === "CAPTURED" && mpgsResult === "SUCCESS";

      const isFailed = ["FAILED", "CANCELLED", "DECLINED"].includes(
        mpgsOrderStatus,
      );

      console.log(`📊 [${traceId}] MPGS Final Status`, {
        mpgsOrderStatus,
        mpgsResult,
        isCaptured,
        isFailed,
      });

      /* =================================================== */
      /* ================= PAYMENT SUCCESS ================= */
      /* =================================================== */
      if (isCaptured) {
        const mpgsTransactionId =
          mpgsOrder?.transaction?.id ||
          mpgsOrder?.authentication?.["3ds"]?.transactionId ||
          mpgsOrder?.authentication?.["3ds2"]?.dsTransactionId ||
          null;

        console.log(
          `💾 [${traceId}] PARKING SUCCESS USING FROZEN META SNAPSHOT`,
        );

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

        console.log(
          `🚨 [${traceId}] FINAL PARKING INSERT PAYLOAD:`,
          JSON.stringify(parkingInsertPayload, null, 2),
        );

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

console.log(
  `✅ [${traceId}] PARKING INSERT SUCCESS RESPONSE:`,
  JSON.stringify(insertResult, null, 2),
);
        } catch (err) {
          if (err.message.includes("ORA-00001")) {
            console.log(`⏭️ [${traceId}] Duplicate insert skipped`);
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

        console.log(`🟢 [${traceId}] Updating meta status to SUCCESS`);

        await ordsUpdateParkingPaymentMetaStatus({
          order_id: orderId,
          status: "SUCCESS",
        });

        console.log(`🏁 [${traceId}] Parking webhook fully processed`);
      } else if (isFailed) {

      /* =================================================== */
      /* ================= PAYMENT FAILED ================== */
      /* =================================================== */
        console.log(`❌ [${traceId}] PARKING PAYMENT FAILED`);

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

        console.log("🔑 Transaction ID:", mpgsTransactionId);

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
