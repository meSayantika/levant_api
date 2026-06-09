/**
 * =============================================
 * SYNERGIC PAY - Web Routes Consolidator
 * =============================================
 * 
 * Aggregates all web (admin panel) route modules.
 * All routes here are prefixed with /admin in server.js.
 */

const express = require("express");
const router = express.Router();

// ---- Import route modules ----
const authRoutes = require("./auth.routes");
const dashboardRoutes = require("./dashboard.routes");
const menuRoutes = require("./menu.routes");
const masterRoutes = require("./master.routes");
const submerchantRoutes = require("./submerchant.routes");
const kycRoutes = require("./kyc.routes");

// ---- Mount routes ----
router.use("/", authRoutes);       // /admin/login, /admin/logout
router.use("/", dashboardRoutes);  // /admin/dashboard
router.use("/", menuRoutes);       // /admin/menu-management
router.use("/master", masterRoutes); // /admin/master/states
router.use("/submerchant", submerchantRoutes); // /admin/submerchant/submerchant_onboard
router.use("/kyc", kycRoutes);     // /admin/kyc/generate_kyc, /admin/kyc/upload_kyc

module.exports = router;
