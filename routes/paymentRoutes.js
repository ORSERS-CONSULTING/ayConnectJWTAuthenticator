const router = require("express").Router();
const { authUser } = require("../middleware/authUser");
const { createPayment, callStripeWebhook } = require("../controllers/paymentController");

// POST /pay
router.post("/pay", authUser, createPayment);
router.post("/webhook", callStripeWebhook );a

module.exports = router;
