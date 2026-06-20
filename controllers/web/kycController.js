const { F_Select, F_Insert } = require("../../models/oracleModel");
const logger = require("../../utils/logger");
const multer = require("multer");
const path = require("path");
const https = require("https");
const fs = require("fs");
const crypto = require("crypto");

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'; // Must be 256 bits (32 characters)
const IV_LENGTH = 16;

function encryptId(text) {
    if (!text) return text;
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(String(text));
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + '-' + encrypted.toString('hex');
}

function decryptId(text) {
    if (!text) return text;
    try {
        let textParts = text.split('-');
        let iv = Buffer.from(textParts.shift(), 'hex');
        let encryptedText = Buffer.from(textParts.join('-'), 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        return null;
    }
}

// Multer Setup
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const encrypted_submerch_id = req.body.submerch_id;
        const submerch_id = decryptId(encrypted_submerch_id) || encrypted_submerch_id || 'default';
        const dir = 'public/uploads/kyc/' + submerch_id + '/';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
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
    const decryptedSubmerchId = decryptId(submerch_id);

    // Fetch merchant details from DB
    let merchantData = {};
    let kycData = {};
    let expiryTime = null;

    if (decryptedSubmerchId) {
        try {
            const sql = `SELECT * FROM SUB_MERCHANTS WHERE SUB_MERCHANT_CODE = :id`;
            const results = await F_Select(0, sql, { id: decryptedSubmerchId });
            if (results && results.length > 0) {
                merchantData = results[0];
            }

            // Fetch existing KYC Data
            const kycSql = `SELECT * FROM TD_KYC_DTLS WHERE SUBMERCHANT_ID = :id`;
            const kycResults = await F_Select(0, kycSql, { id: decryptedSubmerchId });
            if (kycResults && kycResults.length > 0) {
                kycData = kycResults[0];
            }

            // Fetch Expiry Time
            const expirySql = `
                SELECT TO_CHAR(EXPIRED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as EXPIRED_AT
                FROM (
                    SELECT EXPIRED_AT FROM TD_KYC_ACCESS_KEY
                    WHERE SUBMERCHANT_CODE = :id
                    ORDER BY CREATED_AT DESC
                ) WHERE ROWNUM = 1
            `;
            const expiryResults = await F_Select(0, expirySql, { id: decryptedSubmerchId });
            if (expiryResults && expiryResults.length > 0) {
                expiryTime = expiryResults[0].EXPIRED_AT;
            }
        } catch (e) {
            logger.error("Error fetching merchant data for upload page: " + e.message);
        }
    }

    res.render("pages/kyc/upload_kyc", {
        title: "Upload KYC Details",
        user: req.user,
        submerch_id: submerch_id || '',
        decrypted_submerch_id: decryptedSubmerchId || '',
        acc_token: acc_token || '',
        entity_type: entity_type || merchantData.ENTITY_TYPE || '0',
        merchantData,
        kycData,
        expiryTime,
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
                TO_CHAR(k.EXPIRED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as EXISTING_EXPIRED_AT
            FROM SUB_MERCHANTS s
            LEFT JOIN (
                SELECT SUBMERCHANT_CODE, ACCESS_KEY, EXPIRED_AT,
                       ROW_NUMBER() OVER (PARTITION BY SUBMERCHANT_CODE ORDER BY CREATED_AT DESC) as rn
                FROM TD_KYC_ACCESS_KEY
            ) k ON s.SUB_MERCHANT_CODE = k.SUBMERCHANT_CODE AND k.rn = 1
            WHERE LOWER(s.LEGAL_NAME) LIKE LOWER(:query)
               OR LOWER(s.SUB_MERCHANT_CODE) = LOWER(:exactQuery)
        `;
        const binds = { query: `%${query}%`, exactQuery: query };
        const results = await F_Select(0, sql, binds);

        // Process results to strictly ensure only successful onboardings are returned
        const processedResults = results.filter(row => {
            // Block '0' or 'F' starting codes
            if (row.SUB_MERCHANT_CODE === '0') {
                return false;
            }
            // Allow showing results even if RAW_RESPONSE is missing (due to local DB saving)
            if (row.RAW_RESPONSE) {
                try {
                    const responseJson = JSON.parse(row.RAW_RESPONSE);
                    if (responseJson.success === false) return false;
                } catch (e) {
                    // Ignore parse errors
                }
            }
            return true;
        }).map(row => {
            let hasActiveKey = false;
            if (row.EXISTING_EXPIRED_AT) {
                const expiryDate = new Date(row.EXISTING_EXPIRED_AT);
                if (expiryDate > new Date()) {
                    hasActiveKey = true;
                }
            }

            return {
                ...row,
                ENCRYPTED_SUB_MERCHANT_CODE: encryptId(row.SUB_MERCHANT_CODE),
                canGenerateKey: true, // Inherently true since we filtered out failures
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
    const merchant_id = req.query.merchant_id || req.body.merchant_id;
    try {
        let levant_merchant_id = merchant_id;
        
        // Fetch RAW_RESPONSE from DB to get the actual Levant merchant_id
        try {
            const sql = `SELECT RAW_RESPONSE FROM SUB_MERCHANTS WHERE SUB_MERCHANT_CODE = :id`;
            const result = await F_Select(0, sql, { id: merchant_id });
            if (result && result.length > 0 && result[0].RAW_RESPONSE) {
                const rawJson = JSON.parse(result[0].RAW_RESPONSE);
                if (rawJson.data && rawJson.data.merchant_id) {
                    levant_merchant_id = rawJson.data.merchant_id;
                } else if (rawJson.data && rawJson.data.submerch_id) {
                    levant_merchant_id = rawJson.data.submerch_id;
                }
            }
        } catch (dbErr) {
            logger.error("Error fetching Levant merchant ID: " + dbErr.message);
        }

        let parsed_levant_id = parseInt(levant_merchant_id, 10);
        if (isNaN(parsed_levant_id)) parsed_levant_id = levant_merchant_id; // fallback

        const payload = JSON.stringify({ merchant_id: parsed_levant_id });

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
                            // Return error to frontend instead of proceeding
                            return res.json({ success: false, message: "Database Error: " + dbErr.message });
                        }
                    }

                    return res.json(json);
                } catch (e) {
                    return res.json({ success: false, message: "Invalid JSON response from Levant" });
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
        const encrypted_submerch_id = payload.submerch_id;
        const submerch_id = decryptId(encrypted_submerch_id);

        if (!submerch_id) {
            return res.json({ success: false, message: "Invalid Sub-Merchant ID" });
        }

        // We replace the encrypted ID with the decrypted one in the payload 
        // so it saves properly in the DB and gets sent properly to Levant.
        payload.submerch_id = submerch_id;

        // Construct public URL. If PUBLIC_URL is set in .env, use it. Otherwise use req.protocol + host
        let baseUrl = '';
        if (process.env.PUBLIC_URL) {
            baseUrl = process.env.PUBLIC_URL.replace(/\/$/, '') + '/uploads/kyc/' + (submerch_id ? submerch_id + '/' : '');
        } else {
            baseUrl = req.protocol + '://' + req.get('host') + '/uploads/kyc/' + (submerch_id ? submerch_id + '/' : '');
        }

        // Map files to payload keys
        if (files && files.length > 0) {
            files.forEach(file => {
                payload[file.fieldname] = baseUrl + file.filename;
            });
        }

        // Rename pan_no to pan_number for Levant API if present
        if (payload.pan_no && !payload.pan_number) {
            payload.pan_number = payload.pan_no;
            delete payload.pan_no;
        }

        // Remove unnecessary internal fields before sending to API
        delete payload.entity_type_display;

        // Cast to integers for Levant API
        if (payload.entity_type) payload.entity_type = parseInt(payload.entity_type, 10);
        if (payload.gstin_status) payload.gstin_status = parseInt(payload.gstin_status, 10);

        // Clean up GST data based on status to avoid strict validation failures
        if (payload.gstin_status === 1) { // No GST
            payload.gstin = "";
        } else if (payload.gstin_status === 2) { // GST Available
            delete payload.gstin_agreement;
        }

        // Remove empty strings from non-mandatory conditional fields
        if (payload.authorized_signatory_name === "") {
            delete payload.authorized_signatory_name;
        }
        if (payload.websiteurl === "") {
            delete payload.websiteurl;
        }

        let dbActionMsg = "processed";

        // DB Upsert Logic and Missing Data Merge
        if (submerch_id) {
            try {
                // Check if record exists
                const checkSql = `SELECT * FROM TD_KYC_DTLS WHERE SUBMERCHANT_ID = :id`;
                const existing = await F_Select(0, checkSql, { id: submerch_id });

                if (existing && existing.length > 0) {
                    const existingRow = existing[0];

                    // Merge existing DB data into payload if not provided in this request (crucial for files)
                    const reverseMap = {
                        'ACCESS_TOKEN': 'acc_token', 'NAME': 'name', 'PHONE': 'phone', 'ADDRESS': 'address',
                        'CITY': 'city', 'STATE': 'state', 'PIN_CODE': 'pincode', 'WEBSITE_URL': 'websiteurl',
                        'ACC_HOLDER_NAME': 'account_holder_name', 'BANK_NAME': 'bank_name', 'BRANCH_NAME': 'branch_name',
                        'IFSC_CODE': 'ifsc_code', 'ACCOUNT_NO': 'account_number', 'BUSINESS_NAME': 'business_name',
                        'PAN_NO': 'pan_number', 'ENTITY_TYPE': 'entity_type', 'GSTIN_STATUS': 'gstin_status',
                        'GSTIN': 'gstin', 'GSTIN_AGREEMENT': 'gstin_agreement',
                        'AUTHORIZED_SIGNATORY_NAME': 'authorized_signatory_name', 'PAN_CARD': 'pan_card',
                        'ADDRESS_PROOF_FRONT_PAGE': 'address_proof_front_page', 'ADDRESS_PROOF_BACK_PAGE': 'address_proof_back_page',
                        'AUS_AADHAR_CARD_FRONT_PAGE': 'aus_aadhar_card_front_page', 'AUS_AADHAR_CARD_BACK_PAGE': 'aus_aadhar_card_back_page',
                        'AUS_PAN_CARD': 'aus_pan_card', 'BUSINESS_REGISTRATION_PROOF': 'business_registration_proof',
                        'ADDITIONAL_DOCUMENT_1': 'additional_document_1', 'ADDITIONAL_DOCUMENT_2': 'additional_document_2',
                        'SHOP_BOARD_IMAGE': 'shop_board_image', 'STOCK_IMAGE': 'stock_image', 'SHOP_FULL_IMAGE': 'shop_full_image',
                        'AUS_BOARD_RESO_AUTHO': 'aus_board_resolution_authorizing', 'WORK_ORDER': 'work_order',
                        'ADDITIONAL_DOCUMENT_3': 'bank_proof', // Assuming ADDITIONAL_DOCUMENT_3 stores bank_proof
                        'BUSINESS_REG_PROOF_TYPE': 'business_registration_proof_type',
                        'ADDITIONAL_DOCUMENT_3_TYPE': 'additional_document_3_type'
                    };

                    for (let dbKey in reverseMap) {
                        let payloadKey = reverseMap[dbKey];
                        if (!payload[payloadKey] && existingRow[dbKey]) {
                            payload[payloadKey] = existingRow[dbKey];
                        }
                    }

                    // Update existing
                    let updateParts = [];
                    let binds = { id: submerch_id };

                    const columnsMap = {
                        acc_token: 'ACCESS_TOKEN', name: 'NAME', phone: 'PHONE', address: 'ADDRESS',
                        city: 'CITY', state: 'STATE', pincode: 'PIN_CODE', websiteurl: 'WEBSITE_URL',
                        account_holder_name: 'ACC_HOLDER_NAME', bank_name: 'BANK_NAME', branch_name: 'BRANCH_NAME',
                        ifsc_code: 'IFSC_CODE', account_number: 'ACCOUNT_NO', business_name: 'BUSINESS_NAME',
                        pan_no: 'PAN_NO', pan_number: 'PAN_NO', entity_type: 'ENTITY_TYPE', gstin_status: 'GSTIN_STATUS',
                        gstin: 'GSTIN', gstin_agreement: 'GSTIN_AGREEMENT',
                        authorized_signatory_name: 'AUTHORIZED_SIGNATORY_NAME', pan_card: 'PAN_CARD',
                        address_proof_front_page: 'ADDRESS_PROOF_FRONT_PAGE', address_proof_back_page: 'ADDRESS_PROOF_BACK_PAGE',
                        aus_aadhar_card_front_page: 'AUS_AADHAR_CARD_FRONT_PAGE', aus_aadhar_card_back_page: 'AUS_AADHAR_CARD_BACK_PAGE',
                        aus_pan_card: 'AUS_PAN_CARD', business_registration_proof: 'BUSINESS_REGISTRATION_PROOF',
                        additional_document_1: 'ADDITIONAL_DOCUMENT_1', additional_document_2: 'ADDITIONAL_DOCUMENT_2',
                        additional_document_3: 'ADDITIONAL_DOCUMENT_3', shop_board_image: 'SHOP_BOARD_IMAGE',
                        stock_image: 'STOCK_IMAGE', shop_full_image: 'SHOP_FULL_IMAGE',
                        aus_board_resolution_authorizing: 'AUS_BOARD_RESO_AUTHO', work_order: 'WORK_ORDER', bank_proof: 'ADDITIONAL_DOCUMENT_3', // map bank proof safely if needed
                        business_registration_proof_type: 'BUSINESS_REG_PROOF_TYPE',
                        additional_document_3_type: 'ADDITIONAL_DOCUMENT_3_TYPE'
                    };

                    for (let key in columnsMap) {
                        // Skip if key is pan_no since we already mapped to pan_number, but accept either just in case
                        if (payload[key] !== undefined && payload[key] !== null && binds[columnsMap[key]] === undefined) {
                            updateParts.push(`${columnsMap[key]} = :${columnsMap[key]}`);
                            binds[columnsMap[key]] = payload[key];
                        }
                    }

                    if (updateParts.length > 0) {
                        const updateSql = `UPDATE TD_KYC_DTLS SET ${updateParts.join(', ')} WHERE SUBMERCHANT_ID = :id`;
                        await F_Insert(0, updateSql, binds); // Using F_Insert for update
                    }
                    dbActionMsg = "Updated successfully";
                } else {
                    // Insert new
                    let insertColumns = ['ID', 'SUBMERCHANT_ID', 'CREATED_AT', 'CREATED_BY'];
                    let insertValues = ['(SELECT NVL(MAX(ID), 0) + 1 FROM TD_KYC_DTLS)', ':id', 'SYSTIMESTAMP', ':created_by'];
                    let binds = {
                        id: submerch_id,
                        created_by: req.user ? req.user.username : 'SYSTEM'
                    };

                    const columnsMap = {
                        acc_token: 'ACCESS_TOKEN', name: 'NAME', phone: 'PHONE', address: 'ADDRESS',
                        city: 'CITY', state: 'STATE', pincode: 'PIN_CODE', websiteurl: 'WEBSITE_URL',
                        account_holder_name: 'ACC_HOLDER_NAME', bank_name: 'BANK_NAME', branch_name: 'BRANCH_NAME',
                        ifsc_code: 'IFSC_CODE', account_number: 'ACCOUNT_NO', business_name: 'BUSINESS_NAME',
                        pan_no: 'PAN_NO', pan_number: 'PAN_NO', entity_type: 'ENTITY_TYPE', gstin_status: 'GSTIN_STATUS',
                        gstin: 'GSTIN', gstin_agreement: 'GSTIN_AGREEMENT',
                        authorized_signatory_name: 'AUTHORIZED_SIGNATORY_NAME', pan_card: 'PAN_CARD',
                        address_proof_front_page: 'ADDRESS_PROOF_FRONT_PAGE', address_proof_back_page: 'ADDRESS_PROOF_BACK_PAGE',
                        aus_aadhar_card_front_page: 'AUS_AADHAR_CARD_FRONT_PAGE', aus_aadhar_card_back_page: 'AUS_AADHAR_CARD_BACK_PAGE',
                        aus_pan_card: 'AUS_PAN_CARD', business_registration_proof: 'BUSINESS_REGISTRATION_PROOF',
                        additional_document_1: 'ADDITIONAL_DOCUMENT_1', additional_document_2: 'ADDITIONAL_DOCUMENT_2',
                        additional_document_3: 'ADDITIONAL_DOCUMENT_3', shop_board_image: 'SHOP_BOARD_IMAGE',
                        stock_image: 'STOCK_IMAGE', shop_full_image: 'SHOP_FULL_IMAGE',
                        aus_board_resolution_authorizing: 'AUS_BOARD_RESO_AUTHO', work_order: 'WORK_ORDER', bank_proof: 'ADDITIONAL_DOCUMENT_3',
                        business_registration_proof_type: 'BUSINESS_REG_PROOF_TYPE',
                        additional_document_3_type: 'ADDITIONAL_DOCUMENT_3_TYPE'
                    };

                    for (let key in columnsMap) {
                        if (payload[key] !== undefined && payload[key] !== null && binds[columnsMap[key]] === undefined) {
                            insertColumns.push(columnsMap[key]);
                            insertValues.push(`:${columnsMap[key]}`);
                            binds[columnsMap[key]] = payload[key];
                        }
                    }

                    const insertSql = `INSERT INTO TD_KYC_DTLS (${insertColumns.join(', ')}) VALUES (${insertValues.join(', ')})`;
                    await F_Insert(0, insertSql, binds);
                    dbActionMsg = "Inserted successfully";
                }
            } catch (dbErr) {
                logger.error("Error saving KYC Details to DB: " + dbErr.message);
            }
        }

        const levantApiUrl = process.env.UPDATE_KYC_API || 'https://app.levanttech.in/api/v1/updatekyc';

        // Filter payload to ONLY include what Levant API expects based on the sample request
        const levantAllowedKeys = [
            "acc_token", "submerch_id", "name", "phone", "address", "city", "state", "pincode",
            "websiteurl", "account_holder_name", "bank_name", "branch_name", "ifsc_code",
            "account_number", "business_name", "pan_number", "entity_type", "gstin_status",
            "gstin", "gstin_agreement", "authorized_signatory_name", "pan_card",
            "address_proof_front_page", "address_proof_back_page", "aus_aadhar_card_front_page",
            "aus_aadhar_card_back_page", "aus_pan_card", "business_registration_proof",
            "additional_document_1", "additional_document_2", "additional_document_3",
            "shop_board_image", "stock_image", "shop_full_image", "bank_proof"
        ];

        let levantPayload = {};
        for (let key of levantAllowedKeys) {
            if (payload[key] !== undefined && payload[key] !== null && payload[key] !== "") {
                levantPayload[key] = payload[key];
            } else if (key === "gstin" || key === "authorized_signatory_name") {
                levantPayload[key] = ""; // Keep gstin and authorized_signatory_name empty string as per sample
            }
        }

        // Apply default websiteurl if missing
        if (!levantPayload.websiteurl) {
            levantPayload.websiteurl = "https://www.synergicsoftek.in";
        }

        console.log("==========================================");
        console.log("PAYLOAD SENT TO LEVANT KYC API:");
        console.log(JSON.stringify(levantPayload, null, 2));
        console.log("==========================================");

        const apiResponse = await fetch(levantApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': process.env.LEVANT_API_KEY,
                'X-Merchant-Key': process.env.LEVANT_MERCHANT_KEY,
                'X-Environment': process.env.LEVANT_ENV
            },
            body: JSON.stringify(levantPayload)
        });

        const jsonResponse = await apiResponse.json();

        console.log("LEVANT KYC API RESPONSE:");
        console.log(JSON.stringify(jsonResponse, null, 2));

        if (jsonResponse.success) {
            res.json({ success: true, message: dbActionMsg, data: jsonResponse });
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
