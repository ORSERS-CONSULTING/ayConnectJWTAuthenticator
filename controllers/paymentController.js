const {
  initPayment,
  forwardToOrds,
  getPaymentResult,
  ordsProcessPayment,
} = require("../services/ordsServices");
const axios = require("axios");

async function createPayment(req, res) {
  try {
    const b = req.body || {};
    if (b.amount == null || !b.currency) {
      return res
        .status(400)
        .json({ message: "amount and currency are required" });
    }
    const ctx = {
      userId: req.user?.id || req.user?.sub || null,
      serviceId: b.service_id,
      procedureId: b.procedure_id,
      requestId: b.request_id,
      stepOrder: b.step_order,
      email: b.email,
      name: b.name,
    };

    const data = await initPayment(
      {
        amount: b.amount,
        currency: b.currency,
        description: b.description,
        serviceCode: b.service_code,
      },
      ctx
    );
    return res.status(200).json(data);
  } catch (e) {
    console.error("[createPayment] ERROR:", e);
    const code = e.response?.status ?? 500;
    return res
      .status(code)
      .json({ message: e.message, details: e.response?.data });
  }
}

async function proxyStripeToOrds(req, res) {
  try {
    const stripeSig = req.headers["stripe-signature"];
    if (!stripeSig) return res.status(400).send("Missing Stripe-Signature");

    const r = await forwardToOrds(req.body, stripeSig);
    return res.status(r.status).send(r.data ?? "OK");
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).send(e.response?.data || e.message);
  }
}

async function getPaymentResultController(req, res) {
  try {
    const id = req.params.id;
    const out = await getPaymentResult(id);
    return res.status(200).json(out);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res
      .status(code)
      .json({ message: e.message, details: e.response?.data });
  }
}
async function processPayment(req, res) {
  try {
    const request_id = req.body?.request_id || req.query?.request_id;

    // -----------------------------------------------------
    // Validate request_id
    // -----------------------------------------------------
    if (!request_id) {
      console.warn("[processPayment] Missing request_id");
      return res.status(400).json({ message: "request_id is required" });
    }

    console.log("[processPayment] START", {
      method: req.method,
      path: req.originalUrl,
      request_id,
    });

    // -----------------------------------------------------
    // Call ORDS
    // -----------------------------------------------------
    console.log("[processPayment] Calling ORDS → ordsProcessPayment()", {
      request_id,
    });

    const data = await ordsProcessPayment(request_id);

    console.log("[processPayment] ORDS raw response:", {
      status: data?.status,
      headers: data?.headers,
      raw: data?.raw,
      data: data?.data,
    });

    // -----------------------------------------------------
    // Parse ORDS response_body JSON
    // -----------------------------------------------------
    let parsed = data;
    if (typeof data?.response_body === "string") {
      console.log("[processPayment] Parsing response_body…");

      try {
        parsed = JSON.parse(data.response_body);
      } catch (err) {
        console.warn("[processPayment] Failed to parse response_body JSON", {
          error: err.message,
          bodyPreview: data.response_body?.slice(0, 200),
        });
      }
    }

    console.log("[processPayment] Parsed payload:", parsed);

    // -----------------------------------------------------
    // SUCCESS
    // -----------------------------------------------------
    if (parsed?.success === true) {
      console.log("[processPayment] SUCCESS — Payment marked as PAID", {
        request_id,
      });

      return res.status(200).json({
        success: true,
        message: "Service marked as PAID",
        request_id,
      });
    }

    // -----------------------------------------------------
    // FAILURE CASE
    // -----------------------------------------------------
    console.warn("[processPayment] FAILURE — ORDS did not confirm success", {
      request_id,
      parsed,
    });

    return res.status(500).json({
      success: false,
      message:
        parsed?.message || parsed?.error || "Failed to update payment status",
      upstream: parsed,
    });
  } catch (e) {
    // -----------------------------------------------------
    // UNCAUGHT ERROR
    // -----------------------------------------------------
    console.error("[processPayment] ERROR", {
      error: e.message,
      stack: e.stack,
      upstreamStatus: e.response?.status,
      upstreamData: e.response?.data,
    });

    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

module.exports = {
  createPayment,
  proxyStripeToOrds,
  getPaymentResultController,
  processPayment,
};
