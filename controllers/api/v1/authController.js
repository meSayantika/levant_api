/**
 * =============================================
 * SYNERGIC PAY - API v1 Auth Controller Placeholder
 * =============================================
 * 
 * Placeholder for API authentication endpoints.
 * Handles mobile/integration login and token generation.
 */

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { F_Select } = require("../../../models/oracleModel");

/**
 * POST /api/v1/auth/login
 * Authenticate user and return a JWT bearer token.
 */
async function apiLogin(req, res) {
    try {
        const { username, password } = req.body;

        // ---- Validate input ----
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required."
            });
        }

        // ---- Fetch user from database ----
        const query = `SELECT USERNAME, PASSWORD FROM USERS WHERE UPPER(USERNAME) = UPPER(:username)`;
        const users = await F_Select(0, query, [username.trim()]);

        if (!users || users.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials."
            });
        }

        const user = users[0];

        // ---- Compare password ----
        const isMatch = await bcrypt.compare(password, user.PASSWORD);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials."
            });
        }

        // ---- Generate JWT ----
        const token = jwt.sign(
            { username: user.USERNAME },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
        );

        return res.status(200).json({
            success: true,
            message: "Login successful.",
            token: token
        });

    } catch (err) {
        console.error("[API AuthController] apiLogin Error:", err.message);
        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
}

module.exports = { apiLogin };
