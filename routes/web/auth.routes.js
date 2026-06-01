/**
 * =============================================
 * SYNERGIC PAY - Web Auth Routes
 * =============================================
 * 
 * Routes for admin authentication (login, logout).
 * Prefix: /admin
 */

const express = require("express");
const router = express.Router();
const authController = require("../../controllers/web/authController");

// ---- Login Page ----
router.get("/login", authController.renderLoginPage);

// ---- Process Login ----
router.post("/login", authController.processLogin);

// ---- Logout ----
router.get("/logout", authController.handleLogout);

module.exports = router;
