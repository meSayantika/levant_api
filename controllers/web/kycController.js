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
    } catch(e) {
        return null;
    }
}

// Multer Setup
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const submerch_id = req.body.submerch_id || 'default';
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
                ENCRYPTED_SUB_MERCHANT_CODE: encryptId(row.SUB_MERCHANT_CODE),
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
        const encrypted_submerch_id = payload.submerch_id;
        const submerch_id = decryptId(encrypted_submerch_id);

        if (!submerch_id) {
            return res.json({ success: false, message: "Invalid Sub-Merchant ID" });
        }

        // We replace the encrypted ID with the decrypted one in the payload 
        // so it saves properly in the DB and gets sent properly to Levant.
        payload.submerch_id = submerch_id;

        const baseUrl = req.protocol + '://' + req.get('host') + '/uploads/kyc/' + (submerch_id ? submerch_id + '/' : '');

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
                        'ADDITIONAL_DOCUMENT_3': 'bank_proof' // Assuming ADDITIONAL_DOCUMENT_3 stores bank_proof
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
                        aus_board_resolution_authorizing: 'AUS_BOARD_RESO_AUTHO', work_order: 'WORK_ORDER', bank_proof: 'ADDITIONAL_DOCUMENT_3' // map bank proof safely if needed
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
                        aus_board_resolution_authorizing: 'AUS_BOARD_RESO_AUTHO', work_order: 'WORK_ORDER', bank_proof: 'ADDITIONAL_DOCUMENT_3'
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
            // Update raw response
            /* 
            if (submerch_id) {
                try {
                    await F_Insert(0, `UPDATE TD_KYC_DTLS SET RAW_RESPONSE = :resp, RAW_REQ = :req WHERE SUBMERCHANT_ID = :id`, {
                        resp: JSON.stringify(jsonResponse),
                        req: JSON.stringify(payload),
                        id: submerch_id
                    });
                } catch(e) {}
            }
            */
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
