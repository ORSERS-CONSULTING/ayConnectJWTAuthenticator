const router = require("express").Router();
const express = require("express");
const { authUser } = require("../middleware/authUser");
const { createPayment, proxyStripeToOrds } = require("../controllers/paymentController");

// ✅ Parse JSON for /pay ONLY
router.post("/pay", express.json(), authUser, createPayment);

// ✅ Keep RAW body for Stripe webhook so signature works
router.post("/webhook", express.raw({ type: "application/json" }), proxyStripeToOrds);

module.exports = router;
