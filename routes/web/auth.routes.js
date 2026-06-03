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

// ---- Check User Type (AJAX) ----
router.get("/api/v1/auth/check-user-type", authController.checkUserType);

// ---- Forgot Password ----
router.get("/forgot-password", authController.renderForgotPassword);
router.post("/forgot-password", authController.processForgotPassword);

// ---- Reset Password ----
router.get("/reset-password", authController.renderResetPassword);
router.post("/reset-password", authController.processResetPassword);

// ---- TEMPORARY FIX ROUTE ----
router.get("/fix-my-db", authController.fixMyDb);

module.exports = router;
