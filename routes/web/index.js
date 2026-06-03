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

// ---- Mount routes ----
router.use("/", authRoutes);       // /admin/login, /admin/logout
router.use("/", dashboardRoutes);  // /admin/dashboard
router.use("/", menuRoutes);       // /admin/menu-management

module.exports = router;
