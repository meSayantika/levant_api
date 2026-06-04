// routes/api/v1/webhook.routes.js
const express = require('express');
const router = express.Router();

// Import the security middleware and the controller
const { verifyLevantIP } = require('../../../middlewares/webhookAuth.middleware');
const webhookController = require('../../../controllers/api/v1/webhookController');

// 1. SECURITY FIRST: Apply IP Whitelisting to ALL webhook routes
router.use(verifyLevantIP);

// 2. DEFINE THE 4 SEPARATE EVENT ROUTES
// These match the exact URLs we put in the email to Levant

// URL: https://pay.synergicbanking.in/api/v1/webhooks/levant/kyc
router.post('/kyc', webhookController.kycReceiver);

// URL: https://pay.synergicbanking.in/api/v1/webhooks/levant/transaction
router.post('/transaction', webhookController.transactionReceiver);

// URL: https://pay.synergicbanking.in/api/v1/webhooks/levant/settlement-initiate
router.post('/settlement_initiate', webhookController.settlementInitiateReceiver);

// URL: https://pay.synergicbanking.in/api/v1/webhooks/levant/settlement-update
router.post('/settlement_update', webhookController.settlementUpdateReceiver);

module.exports = router;