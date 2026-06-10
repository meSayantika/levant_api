/**
 * =============================================
 * SYNERGIC PAY - Web Dashboard Routes
 * =============================================
 * 
 * Routes for admin dashboard pages.
 * Protected by verifyWebAuth middleware.
 * Prefix: /admin
 */

const express = require("express");
const router = express.Router();
const { verifyWebAuth } = require("../../middlewares/auth.middleware");
const dashboardController = require("../../controllers/web/dashboardController");

// ---- Dashboard Page (Protected) ----
router.get("/dashboard", verifyWebAuth, dashboardController.renderDashboard);

const submerchantController = require("../../controllers/web/submerchantController");

// ---- Sub Merchant Flow (Protected) ----
router.get("/merchants", verifyWebAuth, submerchantController.renderSubMerchantList);
router.get("/merchants/create", verifyWebAuth, submerchantController.renderCreateSubMerchant);
router.get("/merchants/view/:custCd", verifyWebAuth, submerchantController.renderViewSubMerchant);

module.exports = router;
