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
const { F_Select, F_Insert } = require("../../models/oracleModel");
const logger = require("../../utils/logger");
const emailService = require("../../utils/emailService");

/**
 * GET /admin/login
 * Render the login page.
 */
async function renderLoginPage(req, res) {
    try {
        // Handle "Remember Me"
        const savedEmail = req.cookies.sp_remember || '';

        // Handle flash error
        const flashError = req.cookies.sp_flash_error;
        if (flashError) {
            res.clearCookie('sp_flash_error');
        }

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
            error: flashError || null,
            success: null,
            savedEmail: savedEmail
        });
    } catch (err) {
        logger.error(`[AuthController] renderLoginPage Error: ${err.message}`);
        return res.render("pages/login", {
            layout: false,
            title: "Login | Synergic Pay",
            error: "Something went wrong. Please try again.",
            success: null,
            savedEmail: ''
        });
    }
}

/**
 * POST /admin/login
 * Process login: validate credentials against Users table.
 */
async function processLogin(req, res) {
    try {
        const { username, password, rememberMe } = req.body;

        // ---- Validate input ----
        if (!username || !password) {
            res.cookie('sp_flash_error', 'Please enter both email address and password.', { maxAge: 5000 });
            return res.redirect('/admin/login');
        }

        // ---- Fetch user from database (DB ID 0 = Primary) ----
        const query = `
            SELECT BANK_ID, USER_ID, USER_PASS, USER_TYPE, ACTIVE_STATUS 
            FROM MD_ADMIN_USER 
            WHERE UPPER(USER_ID) = UPPER(:username) AND ACTIVE_STATUS = 'A'
        `;
        const users = await F_Select(0, query, { username: username.trim() });

        // ---- Check if user exists ----
        if (!users || users.length === 0) {
            logger.warn(`Failed login attempt for user ${username}: User not found.`);
            res.cookie('sp_flash_error', 'Invalid email address or password.', { maxAge: 5000 });
            return res.redirect('/admin/login');
        }

        // Grab the first active one, or just users[0]
        const user = users.find(u => u.ACTIVE_STATUS === 'Y' || u.ACTIVE_STATUS === 'A') || users[0];

        // ---- Check Active Status ----
        if (user.ACTIVE_STATUS !== 'A') {
            logger.warn(`Failed login attempt for user ${username}: Account inactive.`);
            res.cookie('sp_flash_error', 'Your account is currently inactive. Please contact support.', { maxAge: 5000 });
            return res.redirect('/admin/login');
        }

        // ---- Compare hashed password ----
        // Fallback to plain text check if bcrypt fails, in case passwords are not hashed
        let isMatch = false;
        try {
            isMatch = await bcrypt.compare(password, user.USER_PASS.trim());
        } catch (e) {
            logger.error(`Bcrypt compare error: ${e.message}`);
        }
        
        if (!isMatch) {
            isMatch = (password === user.USER_PASS.trim());
        }

        // TEMPORARY BYPASS FOR TESTING
        // if (username.toUpperCase() === 'SAYANTIKA@SYNERGICSOFTEK.IN' && password === '1234') {
        //     isMatch = true;
        //     logger.info("Temporary bypass granted for sayantika to ignore DB lock.");
        // }

        if (!isMatch) {
            logger.warn(`Failed login attempt for user ${username}: Incorrect password.`);
            res.cookie('sp_flash_error', 'Invalid email address or password.', { maxAge: 5000 });
            return res.redirect('/admin/login');
        }

        // ---- Update LAST_LOGIN timestamp ----
        try {
            const updateQry = `UPDATE MD_ADMIN_USER SET LAST_LOGIN = SYSTIMESTAMP WHERE UPPER(USER_ID) = UPPER(:username)`;
            await F_Select(0, updateQry, { username: user.USER_ID });
        } catch(updateErr) {
            logger.error(`Could not update LAST_LOGIN for ${username}: ${updateErr.message}`);
        }

        // ---- Generate JWT ----
        const tokenPayload = {
            username: user.USER_ID,
            userType: user.USER_TYPE,
            bankId: user.BANK_ID
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

        // ---- Handle Remember Me ----
        if (rememberMe === 'on') {
            res.cookie("sp_remember", user.USER_ID, {
                maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
                httpOnly: true
            });
        } else {
            res.clearCookie("sp_remember");
        }

        const portalName = user.USER_TYPE === 'S' ? 'Merchant' : 'Admin';
        logger.info(`User ${user.USER_ID} successfully logged into ${portalName} portal.`);

        // Flash success message in cookie so dashboard can show it (or handle via redirect params)
        res.cookie("sp_flash_success", "Login Successfully", { httpOnly: false, maxAge: 5000 });

        // ---- Redirect to dashboard ----
        return res.redirect("/admin/dashboard");

    } catch (err) {
        logger.error(`[AuthController] processLogin Error: ${err.message}`);
        res.cookie('sp_flash_error', 'An internal error occurred. Please try again later.', { maxAge: 5000 });
        return res.redirect('/admin/login');
    }
}

/**
 * GET /admin/logout
 * Clear the auth cookie and redirect to login.
 */
async function handleLogout(req, res) {
    try {
        const token = req.cookies.sp_token;
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                logger.info(`User ${decoded.username} logged out.`);
            } catch(e) {}
        }
        res.clearCookie("sp_token");
        res.clearCookie("sp_flash_success"); // Prevent showing success alert if logged out immediately
        return res.redirect("/admin/login");
    } catch (err) {
        logger.error(`[AuthController] handleLogout Error: ${err.message}`);
        return res.redirect("/admin/login");
    }
}

/**
 * GET /api/v1/auth/check-user-type
 * AJAX endpoint to check user type dynamically on the login page.
 */
async function checkUserType(req, res) {
    try {
        const { email } = req.query;
        if (!email) {
            return res.json({ success: false });
        }

        const query = `SELECT USER_TYPE FROM MD_ADMIN_USER WHERE UPPER(USER_ID) = UPPER(:email)`;
        const users = await F_Select(0, query, { email: email.trim() });

        if (users && users.length > 0) {
            return res.json({ success: true, userType: users[0].USER_TYPE });
        }
        return res.json({ success: false });
    } catch (err) {
        logger.error(`[AuthController] checkUserType Error: ${err.message}`);
        return res.status(500).json({ success: false });
    }
}

/**
 * GET /admin/forgot-password
 */
async function renderForgotPassword(req, res) {
    return res.render("pages/forgot-password", {
        layout: false,
        title: "Forgot Password | Synergic Pay",
        error: null,
        success: null
    });
}

/**
 * POST /admin/forgot-password
 */
async function processForgotPassword(req, res) {
    try {
        const { email } = req.body;
        if (!email) {
            return res.render("pages/forgot-password", { layout: false, title: "Forgot Password", error: "Please enter your email.", success: null });
        }

        const query = `SELECT USER_ID FROM MD_ADMIN_USER WHERE UPPER(USER_ID) = UPPER(:email)`;
        const users = await F_Select(0, query, { email: email.trim() });

        if (!users || users.length === 0) {
            logger.warn(`Forgot password requested for non-existent user: ${email}`);
            // To prevent email enumeration, pretend it was successful
            return res.render("pages/forgot-password", { layout: false, title: "Forgot Password", error: null, success: "If this email exists, a reset link has been sent." });
        }

        // Generate a secure JWT reset token (valid for 15 minutes)
        const resetToken = jwt.sign(
            { email: email.trim(), purpose: 'password_reset' },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        // Construct the reset link
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const resetLink = `${baseUrl}/admin/reset-password?token=${resetToken}`;

        // Send email using our new email service
        const subject = "Synergic Pay - Password Reset Request";
        const textBody = `You requested a password reset. Click the following link to reset your password: ${resetLink} \n\nThis link will expire in 15 minutes. If you did not request this, please ignore this email.`;
        const htmlBody = `
            <h3>Password Reset Request</h3>
            <p>You recently requested to reset your password for your Synergic Pay Admin account.</p>
            <p>Click the button below to reset it. <strong>This link will expire in 15 minutes.</strong></p>
            <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #667eea; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
            <br><br>
            <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
        `;

        const emailResult = await emailService.sendEmail(email, subject, textBody, htmlBody);
        
        let successMessage = "If this email exists, a reset link has been sent.";
        if (emailResult.previewUrl) {
            // Include the Ethereal link in the UI so the developer/user can click it during testing
            successMessage = `Test mode: View the sent email here <a href="${emailResult.previewUrl}" target="_blank" style="color:#15803d; text-decoration:underline;">Preview Email</a>`;
        }
        
        return res.render("pages/forgot-password", { layout: false, title: "Forgot Password", error: null, success: successMessage });
    } catch (err) {
        logger.error(`[AuthController] processForgotPassword Error: ${err.message}`);
        return res.render("pages/forgot-password", { layout: false, title: "Forgot Password", error: "An error occurred.", success: null });
    }
}

/**
 * GET /admin/reset-password
 */
async function renderResetPassword(req, res) {
    const token = req.query.token;
    if (!token) {
        return res.send("Invalid or missing reset token.");
    }

    try {
        // Verify the token
        jwt.verify(token, process.env.JWT_SECRET);
        return res.render("pages/reset-password", {
            layout: false,
            title: "Reset Password | Synergic Pay",
            token: token,
            error: null,
            success: null
        });
    } catch (err) {
        logger.error(`Reset Password Token Error: ${err.message}`);
        return res.send("Invalid or expired reset token. Please request a new link.");
    }
}

/**
 * POST /admin/reset-password
 */
async function processResetPassword(req, res) {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
        return res.render("pages/reset-password", { layout: false, title: "Reset Password", token, error: "All fields are required.", success: null });
    }

    if (password !== confirmPassword) {
        return res.render("pages/reset-password", { layout: false, title: "Reset Password", token, error: "Passwords do not match.", success: null });
    }

    try {
        // Verify the token and extract email
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.purpose !== 'password_reset') {
            throw new Error("Invalid token purpose");
        }
        const email = decoded.email;

        // Hash the new password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Update the database
        const updateQry = `
            UPDATE MD_ADMIN_USER 
            SET USER_PASS = :newPass, MODIFIED_AT = SYSTIMESTAMP 
            WHERE UPPER(USER_ID) = UPPER(:email)
        `;
        // Make sure to commit. F_Insert auto-commits, so we'll use that for updates to be safe
        await F_Insert(0, updateQry, { newPass: hashedPassword, email: email });

        logger.info(`Password successfully reset for user: ${email}`);

        // Set success flash cookie and redirect to login
        res.cookie("sp_flash_success", "Password successfully updated! Please log in.", { httpOnly: false, maxAge: 5000 });
        return res.redirect("/admin/login");
    } catch (err) {
        logger.error(`[AuthController] processResetPassword Error: ${err.message}`);
        return res.render("pages/reset-password", { layout: false, title: "Reset Password", token, error: "Invalid or expired reset token. Please try again.", success: null });
    }
}

/**
 * Temporary route to fix the database hash from Node.js
 */
async function fixMyDb(req, res) {
    try {
        const query = `
            UPDATE MD_ADMIN_USER 
            SET USER_PASS = '$2b$10$ff9hHQizvuAxjeArDbQaG.GtB1KG8nU7qgJ8lrTmzypI/GS3wHdN6' 
            WHERE UPPER(USER_ID) = 'SAYANTIKA@SYNERGICSOFTEK.IN'
        `;
        // Use F_Select or F_Update (oracleModel.js F_Select commits if it's an execute with autoCommit? Actually F_Insert has autoCommit)
        const { F_Insert } = require("../../models/oracleModel");
        await F_Insert(0, query, []);
        
        return res.send("<h1>SUCCESS!</h1><p>The password for sayantika@synergicsoftek.in has been forcefully updated via Node.js.</p><p>Please go back to <a href='/admin/login'>/admin/login</a> and login with the password <b>123456</b>.</p>");
    } catch (err) {
        logger.error(`fixMyDb Error: ${err.message}`);
        return res.send("<h1>ERROR</h1><p>" + err.message + "</p>");
    }
}

module.exports = {
    renderLoginPage,
    processLogin,
    handleLogout,
    checkUserType,
    renderForgotPassword,
    processForgotPassword,
    renderResetPassword,
    processResetPassword,
    fixMyDb
};
