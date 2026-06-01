/**
 * =============================================
 * SYNERGIC PAY - Web Auth Controller
 * =============================================
 * 
 * Handles login page rendering, login processing,
 * and logout for the Admin Panel (/admin routes).
 */

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { F_Select } = require("../../models/oracleModel");

/**
 * GET /admin/login
 * Render the login page.
 */
async function renderLoginPage(req, res) {
    try {
        // If user already has a valid token, redirect to dashboard
        if (req.cookies.sp_token) {
            try {
                jwt.verify(req.cookies.sp_token, process.env.JWT_SECRET);
                return res.redirect("/admin/dashboard");
            } catch (e) {
                // Token invalid — clear it and show login
                res.clearCookie("sp_token");
            }
        }

        return res.render("pages/login", {
            layout: false, // Login page uses NO layout (no sidebar/header)
            title: "Login | Synergic Pay",
            error: null
        });
    } catch (err) {
        console.error("[AuthController] renderLoginPage Error:", err.message);
        return res.render("pages/login", {
            layout: false,
            title: "Login | Synergic Pay",
            error: "Something went wrong. Please try again."
        });
    }
}

/**
 * POST /admin/login
 * Process login: validate credentials against Users table.
 */
async function processLogin(req, res) {
    try {
        const { username, password } = req.body;

        // ---- Validate input ----
        if (!username || !password) {
            return res.render("pages/login", {
                layout: false,
                title: "Login | Synergic Pay",
                error: "Please enter both username and password."
            });
        }

        // ---- Fetch user from database (DB ID 0 = Primary) ----
        const query = `SELECT USER_NAME AS USERNAME, MPIN AS PASSWORD FROM MD_USER WHERE UPPER(USER_CD) = UPPER(:username)`;
        const users = await F_Select(0, query, [username.trim()]);

        // ---- Check if user exists ----
        if (!users || users.length === 0) {
            return res.render("pages/login", {
                layout: false,
                title: "Login | Synergic Pay",
                error: "Invalid username or password."
            });
        }

        const user = users[0];

        // ---- Compare hashed password ----
        const isMatch = await bcrypt.compare(password, user.PASSWORD);
        if (!isMatch) {
            return res.render("pages/login", {
                layout: false,
                title: "Login | Synergic Pay",
                error: "Invalid username or password."
            });
        }

        // ---- Generate JWT ----
        const tokenPayload = {
            username: user.USERNAME
        };

        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || "1d"
        });

        // ---- Set HTTP-only secure cookie ----
        res.cookie("sp_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: parseInt(process.env.COOKIE_MAX_AGE) || 86400000, // 24 hours
            sameSite: "strict"
        });

        // ---- Redirect to dashboard ----
        return res.redirect("/admin/dashboard");

    } catch (err) {
        console.error("[AuthController] processLogin Error:", err.message);
        return res.render("pages/login", {
            layout: false,
            title: "Login | Synergic Pay",
            error: "An internal error occurred. Please try again later."
        });
    }
}

/**
 * GET /admin/logout
 * Clear the auth cookie and redirect to login.
 */
async function handleLogout(req, res) {
    try {
        res.clearCookie("sp_token");
        return res.redirect("/admin/login");
    } catch (err) {
        console.error("[AuthController] handleLogout Error:", err.message);
        return res.redirect("/admin/login");
    }
}

module.exports = {
    renderLoginPage,
    processLogin,
    handleLogout
};
