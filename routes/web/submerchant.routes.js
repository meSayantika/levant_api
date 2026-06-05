/**
 * =============================================
 * SYNERGIC PAY - Web Sub Merchant Routes
 * =============================================
 */

const express = require("express");
const router = express.Router();
const { verifyWebAuth } = require("../../middlewares/auth.middleware");
const submerchantController = require("../../controllers/web/submerchantController");

// ---- Sub Merchant Onboarding Form Submission ----
// Protected by verifyWebAuth
router.post("/submerchant_onboard", verifyWebAuth, submerchantController.processCreateSubMerchant);

module.exports = router;
