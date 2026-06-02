const axios = require("axios");
const { getIdcsToken } = require("./idcsServices");

async function callGateway(method, path, { params, data } = {}) {
  const url = `${process.env.GATEWAY_BASE_URL}/${path}`;
  const token = await getIdcsToken(url);
  const res = await axios({
    url,
    method,
    params,
    data,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
}

async function ordsInitPayment({
  user_id,
  payment_type,
  reference_id,
  amount,
}) {
  if (!user_id || !payment_type || !reference_id || !amount) {
    console.error("Missing required payment fields:", {
      user_id,
      payment_type,
      reference_id,
      amount,
    });

    throw new Error("Missing required payment fields");
  }

  return callGateway("POST", "initiatePayment", {
    data: {
      user_id: Number(user_id),
      payment_type,
      reference_id: Number(reference_id),
      amount: Number(amount),
    },
  });
}

async function ordsUpdatePaymentSession({
  payment_id,
  mpgs_order_id,
  mpgs_session_id,
}) {
  if (!payment_id || !mpgs_order_id || !mpgs_session_id) {
    throw new Error("Missing MPGS session fields");
  }

  return callGateway("POST", "updatePaymentSession", {
    data: {
      payment_id: Number(payment_id),
      mpgs_order_id,
      mpgs_session_id,
    },
  });
}

async function ordsUpdatePaymentStatus({
  payment_id,
  status,
  mpgs_transaction_id,
  result_reason,
}) {
  if (!payment_id || !status) {
    throw new Error("payment_id and status are required");
  }

  try {
    const res = await callGateway("POST", "updatePaymentStatus", {
      data: {
        payment_id: Number(payment_id),
        status,
        mpgs_transaction_id,
        result_reason,
      },
    });

    return res;
  } catch (err) {
    console.error("💥 [ORDS ERROR FULL]:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
      url: err.config?.url,
      params: err.config?.params,
      requestData: err.config?.data,
    });

    throw err;
  }
}

async function ordsGetPayment(order_id) {
  if (!order_id) throw new Error("order_id is required");

  const res = await callGateway("GET", "getPaymentStatus", {
    params: { order_id },
  });

  return res?.items?.[0] || null;
}

function ordsGetParkingInfo({ plate_number, plate_category, plate_area_name }) {
  if (!plate_number || !plate_category || !plate_area_name) {
    throw new Error(
      "plate_number, plate_category and plate_area_name are required",
    );
  }

  return callGateway("GET", "getParkingInfo", {
    data: {
      plate_number,
      plate_category,
      plate_area_name,
    },
  });
}

function ordsInitiateParkingPayment({
  entry_guid,
  plate_number,
  time_in,
  time_spent_min,
  amount,
  center_fees_spent,
  minutes_free,
}) {
  if (!entry_guid || !plate_number || amount == null) {
    throw new Error("Missing required parking payment fields");
  }

  return callGateway("POST", "initiateParkingPayment", {
    data: {
      entry_guid: String(entry_guid),
      plate_number: String(plate_number),
      time_in: String(time_in),
      time_spent_min: Number(time_spent_min),
      amount_due: Number(amount),
      center_fees_spent: Number(center_fees_spent ?? 0),
      minutes_free: Number(minutes_free ?? 0),
    },
  });
}

function ordsUpdateParkingSession({
  payment_id,
  mpgs_order_id,
  mpgs_session_id,
}) {
  if (!payment_id) throw new Error("payment_id is required");

  return callGateway("POST", "updateParkingSession", {
    data: {
      payment_id: Number(payment_id),
      mpgs_order_id,
      mpgs_session_id,
    },
  });
}

function ordsUpdateParkingStatus({
  payment_id,
  payment_status,
  amount_paid,
  mpgs_txn_id,
}) {
  if (!payment_id || !payment_status) {
    throw new Error("payment_id and payment_status are required");
  }

  return callGateway("POST", "updateParkingStatus", {
    data: {
      payment_id: Number(payment_id),
      payment_status,
      amount_paid: amount_paid != null ? Number(amount_paid) : null,
      mpgs_txn_id: mpgs_txn_id || null,
    },
  });
}

async function ordsGetParkingPayment(payment_id) {
  if (!payment_id) throw new Error("payment_id is required");

  const res = await callGateway("GET", "getParkingPaymentStatus", {
    params: { payment_id: Number(payment_id) },
  });

  return res?.items?.[0] || null;
}

function ordsInsertParkingPayment({
  entry_guid,

  locked_time_spent_min,
  amount_paid,

  locked_center_fees_spent,
  locked_minutes_free,

  locked_deadline_to_leave,

  locked_gross_amount,
  locked_already_paid,

  mpgs_order_id,
  mpgs_session_id,
  mpgs_txn_id,
}) {
  if (!entry_guid || amount_paid == null) {
    throw new Error("Missing required parking insert fields");
  }

  return callGateway("POST", "insertParkingPayment", {
    data: {
      entry_guid: String(entry_guid),

      locked_time_spent_min: Number(locked_time_spent_min ?? 0),

      amount_paid: Number(amount_paid),

      locked_center_fees_spent: Number(locked_center_fees_spent ?? 0),

      locked_minutes_free: Number(locked_minutes_free ?? 0),

      locked_deadline_to_leave: locked_deadline_to_leave
        ? String(locked_deadline_to_leave)
        : null,

      locked_gross_amount: Number(locked_gross_amount ?? amount_paid),

      locked_already_paid: Number(locked_already_paid ?? 0),

      mpgs_order_id: mpgs_order_id ? String(mpgs_order_id) : null,

      mpgs_session_id: mpgs_session_id ? String(mpgs_session_id) : null,

      mpgs_txn_id: mpgs_txn_id ? String(mpgs_txn_id) : null,
    },
  });
}

function ordsInsertParkingPaymentMeta({
  order_id,
  entry_guid,
  plate_number,
  plate_category,
  plate_area_name,

  locked_amount_due,
  locked_time_spent_min,
  locked_center_fees_spent,
  locked_minutes_free,
  locked_deadline_to_leave,
  locked_time_in,
  locked_is_valet,
  locked_gross_amount,
  locked_already_paid,
}) {
  if (!order_id || !entry_guid || !plate_number) {
    throw new Error("order_id, entry_guid and plate_number are required");
  }

  if (
    locked_amount_due == null ||
    locked_time_spent_min == null ||
    !locked_deadline_to_leave ||
    !locked_time_in
  ) {
    throw new Error(
      "locked_amount_due, locked_time_spent_min, locked_deadline_to_leave, and locked_time_in are required",
    );
  }

  return callGateway("POST", "insertParkingPaymentMeta", {
    data: {
      order_id: String(order_id),
      entry_guid: String(entry_guid),

      plate_number: String(plate_number),
      plate_category: plate_category ? String(plate_category) : null,
      plate_area_name: plate_area_name ? String(plate_area_name) : null,

      locked_amount_due: Number(locked_amount_due),
      locked_time_spent_min: Number(locked_time_spent_min),

      locked_center_fees_spent:
        locked_center_fees_spent != null
          ? Number(locked_center_fees_spent)
          : 0,

      locked_minutes_free:
        locked_minutes_free != null ? Number(locked_minutes_free) : 0,

      locked_deadline_to_leave: String(locked_deadline_to_leave),
      locked_time_in: String(locked_time_in),

      locked_is_valet: locked_is_valet != null ? Number(locked_is_valet) : 0,

      locked_gross_amount:
        locked_gross_amount != null
          ? Number(locked_gross_amount)
          : Number(locked_amount_due),

      locked_already_paid:
        locked_already_paid != null ? Number(locked_already_paid) : 0,
    },
  });
}

function ordsUpdateParkingPaymentMetaStatus({ order_id, status }) {
  if (!order_id || !status) {
    throw new Error("order_id and status are required");
  }

  return callGateway("POST", "updateParkingPaymentMetaStatus", {
    data: {
      order_id: String(order_id),
      status: String(status),
    },
  });
}

async function ordsGetParkingPaymentMeta({ order_id }) {
  if (!order_id) throw new Error("order_id is required");

  let res;

  try {
    res = await callGateway("GET", "getParkingMetadata", {
      params: { order_id: String(order_id) },
    });
  } catch (err) {
    console.error("❌ [META] ORDS ERROR:", {
      message: err.message,
      status: err?.response?.status,
      data: err?.response?.data,
    });
    throw err;
  }

  const result = res?.items?.[0] || null;

  return result;
}


module.exports = {
  callGateway,
  ordsInitPayment,
  ordsUpdatePaymentSession,
  ordsUpdatePaymentStatus,
  ordsGetPayment,
  ordsInitiateParkingPayment,
  ordsUpdateParkingSession,
  ordsUpdateParkingStatus,
  ordsGetParkingPayment,
  ordsInsertParkingPayment,
  ordsInsertParkingPaymentMeta,
  ordsGetParkingPaymentMeta,
  ordsUpdateParkingPaymentMetaStatus,
  ordsGetParkingInfo
};
