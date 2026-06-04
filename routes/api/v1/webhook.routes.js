// routes/api/v1/webhook.routes.js
const express = require('express');
const router = express.Router();
// const csrf = require("csurf");

// Import the security middleware and the controller
const { verifyLevantIP } = require('../../../middlewares/webhookAuth.middleware');
const webhookController = require('../../../controllers/api/v1/webhookController');

// const csrfProtection = csrf({ cookie: true });
// router.use(csrfProtection);

// 1. SECURITY FIRST: Apply IP Whitelisting to ALL webhook routes
router.use(verifyLevantIP);

// 2. DEFINE THE 4 SEPARATE EVENT ROUTES
// These match the exact URLs we put in the email to Levant

// URL: https://pay.synergicbanking.in/api/v1/webhooks/levant/kyc
router.all('/kyc', webhookController.kycReceiver);

// URL: https://pay.synergicbanking.in/api/v1/webhooks/levant/transaction
router.all('/transaction', webhookController.transactionReceiver);

// URL: https://pay.synergicbanking.in/api/v1/webhooks/levant/settlement-initiate
router.all('/settlement_initiate', webhookController.settlementInitiateReceiver);

// URL: https://pay.synergicbanking.in/api/v1/webhooks/levant/settlement-update
router.all('/settlement_update', webhookController.settlementUpdateReceiver);

module.exports = router;