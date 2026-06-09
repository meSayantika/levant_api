const { F_Select, F_Insert } = require("../../models/oracleModel");
const logger = require("../../utils/logger");
const multer = require("multer");
const path = require("path");
const https = require("https");

// Multer Setup
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/kyc/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const uploadKyc = multer({ storage: storage });

async function renderGenerateKycPage(req, res) {
    res.render("pages/kyc/generate_kyc", {
        title: "Generate KYC Access Key",
        user: req.user,
        currentRoute: "/admin/kyc/generate_kyc"
    });
}

async function renderUploadKycPage(req, res) {
    const { submerch_id, acc_token, entity_type } = req.query;

    // Fetch merchant details from DB
    let merchantData = {};
    if (submerch_id) {
        try {
            const sql = `SELECT * FROM SUB_MERCHANTS WHERE SUB_MERCHANT_CODE = :id`;
            const results = await F_Select(0, sql, { id: submerch_id });
            if (results && results.length > 0) {
                merchantData = results[0];
            }
        } catch (e) {
            logger.error("Error fetching merchant data for upload page: " + e.message);
        }
    }

    res.render("pages/kyc/upload_kyc", {
        title: "Upload KYC Details",
        user: req.user,
        submerch_id: submerch_id || '',
        acc_token: acc_token || '',
        entity_type: entity_type || merchantData.ENTITY_TYPE || '0',
        merchantData,
        currentRoute: "/admin/kyc/generate_kyc"
    });
}

async function searchSubmerchant(req, res) {
    try {
        const { query } = req.body;
        if (!query) return res.json({ success: false, message: "Query is required" });

        const sql = `
            SELECT CUST_CD, SUB_MERCHANT_CODE, LEGAL_NAME, EMAIL, PHONE, ENTITY_TYPE
            FROM SUB_MERCHANTS
            WHERE LOWER(LEGAL_NAME) LIKE LOWER(:query)
               OR SUB_MERCHANT_CODE = :exactQuery
        `;
        const binds = { query: `%${query}%`, exactQuery: query };
        const results = await F_Select(0, sql, binds);
        res.json({ success: true, data: results });
    } catch (error) {
        logger.error("Error searching submerchant: " + error.message);
        res.json({ success: false, message: error.message });
    }
}

async function generateAccessKey(req, res) {
    const { merchant_id } = req.body;
    try {
        const payload = JSON.stringify({ merchant_id });

        const options = {
            hostname: 'app.levanttech.in',
            port: 443,
            path: '/api/v1/kycaccesskey',
            method: 'GET',
            headers: {
                'X-API-Key': process.env.LEVANT_API_KEY,
                'X-Merchant-Key': process.env.LEVANT_MERCHANT_KEY,
                'X-Environment': process.env.LEVANT_ENV,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const httpRequest = https.request(options, (httpRes) => {
            let data = '';
            httpRes.on('data', (chunk) => {
                data += chunk;
            });
            httpRes.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    res.json(json);
                } catch (e) {
                    res.json({ success: false, message: "Invalid JSON response from Levant" });
                }
            });
        });

        httpRequest.on('error', (error) => {
            logger.error("Error generating KYC access key: " + error.message);
            res.json({ success: false, message: error.message });
        });

        httpRequest.write(payload);
        httpRequest.end();

    } catch (error) {
        logger.error("Error generating KYC access key: " + error.message);
        res.json({ success: false, message: error.message });
    }
}

async function processUploadKyc(req, res) {
    try {
        const payload = req.body;
        const files = req.files;

        const baseUrl = req.protocol + '://' + req.get('host') + '/uploads/kyc/';

        // Map files to payload keys
        if (files && files.length > 0) {
            files.forEach(file => {
                payload[file.fieldname] = baseUrl + file.filename;
            });
        }

        // Add additional mapped fields if required
        // e.g. payload.gstin_status mapping if not already mapped correctly

        const levantApiUrl = process.env.GENERATE_KYC_KEY_API;

        const apiResponse = await fetch(levantApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': process.env.LEVANT_API_KEY,
                'X-Merchant-Key': process.env.LEVANT_MERCHANT_KEY,
                'X-Environment': process.env.LEVANT_ENV
            },
            body: JSON.stringify(payload)
        });

        const jsonResponse = await apiResponse.json();

        if (jsonResponse.success) {
            res.json({ success: true, message: "KYC Details updated successfully", data: jsonResponse });
        } else {
            res.json({ success: false, message: "Failed to update KYC: " + (jsonResponse.message || "Unknown error"), data: jsonResponse });
        }

    } catch (err) {
        logger.error("Error uploading KYC details: " + err.message);
        res.json({ success: false, message: "An error occurred during KYC upload." });
    }
}

module.exports = {
    renderGenerateKycPage,
    renderUploadKycPage,
    searchSubmerchant,
    generateAccessKey,
    processUploadKyc,
    uploadKyc
};
