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
            SELECT 
                s.CUST_CD, s.SUB_MERCHANT_CODE, s.LEGAL_NAME, s.EMAIL, s.PHONE, s.ENTITY_TYPE, s.RAW_RESPONSE,
                k.ACCESS_KEY as EXISTING_ACCESS_KEY,
                k.EXPIRED_AT as EXISTING_EXPIRED_AT
            FROM SUB_MERCHANTS s
            LEFT JOIN (
                SELECT SUBMERCHANT_CODE, ACCESS_KEY, EXPIRED_AT,
                       ROW_NUMBER() OVER (PARTITION BY SUBMERCHANT_CODE ORDER BY CREATED_AT DESC) as rn
                FROM TD_KYC_ACCESS_KEY
            ) k ON s.SUB_MERCHANT_CODE = k.SUBMERCHANT_CODE AND k.rn = 1
            WHERE LOWER(s.LEGAL_NAME) LIKE LOWER(:query)
               OR s.SUB_MERCHANT_CODE = :exactQuery
        `;
        const binds = { query: `%${query}%`, exactQuery: query };
        const results = await F_Select(0, sql, binds);

        // Process results to check onboarding status
        const processedResults = results.map(row => {
            let canGenerateKey = true;
            if (row.RAW_RESPONSE) {
                try {
                    const responseJson = JSON.parse(row.RAW_RESPONSE);
                    if (responseJson.success === false) {
                        canGenerateKey = false;
                    }
                } catch (e) {
                    // Ignore parse error, default to true
                }
            }
            let hasActiveKey = false;
            if (row.EXISTING_EXPIRED_AT) {
                const expiryDate = new Date(row.EXISTING_EXPIRED_AT);
                if (expiryDate > new Date()) {
                    hasActiveKey = true;
                }
            }

            return {
                ...row,
                canGenerateKey,
                hasActiveKey
            };
        });

        res.json({ success: true, data: processedResults });
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
            httpRes.on('end', async () => {
                try {
                    const json = JSON.parse(data);

                    // If Levant succeeded and generated a key, log it in the database
                    const actualData = json.data || (json.message && json.message.data) || null;
                    const accessKey = actualData ? actualData.access_key : null;

                    if (json.success && accessKey) {
                        // Calculate expiry fallback if Levant didn't provide one
                        let expiredAt = actualData ? (actualData.expired_at || actualData.expiry_at) : null;
                        if (!expiredAt) {
                            const tomorrow = new Date();
                            tomorrow.setHours(tomorrow.getHours() + 24);
                            expiredAt = tomorrow.toISOString(); // Use ISO format for parsing easily
                        }

                        // Save to TD_KYC_ACCESS_KEY
                        try {
                            const insertSql = `
                                INSERT INTO TD_KYC_ACCESS_KEY (
                                    ID, SUBMERCHANT_CODE, ACCESS_KEY, EXPIRED_AT, 
                                    CREATED_BY, CREATED_AT, REQ_PAYLOAD, RAW_RESPONSE
                                ) VALUES (
                                    (SELECT NVL(MAX(ID), 0) + 1 FROM TD_KYC_ACCESS_KEY),
                                    :SUBMERCHANT_CODE, :ACCESS_KEY, TO_TIMESTAMP_TZ(:EXPIRED_AT, 'YYYY-MM-DD"T"HH24:MI:SS.FFTZH:TZM'), 
                                    :CREATED_BY, SYSTIMESTAMP, :REQ_PAYLOAD, :RAW_RESPONSE
                                )
                            `;
                            
                            const bindParams = {
                                SUBMERCHANT_CODE: merchant_id,
                                ACCESS_KEY: accessKey,
                                EXPIRED_AT: new Date(expiredAt).toISOString(), // Normalizing ISO string
                                CREATED_BY: req.user ? req.user.username : 'SYSTEM',
                                REQ_PAYLOAD: payload,
                                RAW_RESPONSE: data
                            };

                            await F_Insert(0, insertSql, bindParams);
                        } catch (dbErr) {
                            logger.error("Failed to insert into TD_KYC_ACCESS_KEY: " + dbErr.message);
                            // We still return success to frontend since key was generated
                        }
                    }

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
