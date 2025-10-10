const router = require("express").Router();
const { authUser } = require("../middleware/authUser");
const { createPayment, triggerStripeWebhook } = require("../controllers/paymentController");

// POST /pay
router.post("/pay", authUser, createPayment);
router.post("/webhook", triggerStripeWebhook );

module.exports = router;
