const router = require("express").Router();
const express = require("express");
const { authUser } = require("../middleware/authUser");
const { createPayment, proxyStripeToOrds } = require("../controllers/paymentController");

// POST /pay
router.post("/pay", authUser, createPayment);
router.post("/webhook", express.raw({ type: "application/json" }), proxyStripeToOrds);

module.exports = router;
