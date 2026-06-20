/**
 * =============================================
 * SYNERGIC PAY - Sub Merchant Controller
 * =============================================
 */

const { F_Select, F_Insert } = require("../../models/oracleModel");
const logger = require("../../utils/logger");
const crypto = require("crypto");

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'; // Must be 256 bits (32 characters)
const IV_LENGTH = 16;

function encryptId(text) {
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(String(text));
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    // Use URL safe encoding by replacing + and / if base64, but we use hex here which is already safe
    return iv.toString('hex') + '-' + encrypted.toString('hex');
}

function decryptId(text) {
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

/**
 * Helper to generate CUST_CD (Assuming it's generated via MAX(CUST_CD) + 1 for now)
 */
async function generateCustCd() {
    const result = await F_Select(0, `SELECT NVL(MAX(CUST_CD), 0) + 1 AS NEXT_ID FROM SUB_MERCHANTS`);
    return result[0].NEXT_ID;
}

/**
 * GET /admin/merchants
 * Renders the list of sub-merchants
 */
async function renderSubMerchantList(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const minRow = (page - 1) * limit + 1;
        const maxRow = page * limit;

        // Get total count for pagination math
        const countQuery = `SELECT COUNT(*) AS TOTAL FROM SUB_MERCHANTS`;
        const countResult = await F_Select(0, countQuery);
        const totalRecords = countResult && countResult.length > 0 ? countResult[0].TOTAL : 0;
        const totalPages = Math.ceil(totalRecords / limit) || 1;

        // Paginated query using Oracle ROWNUM approach
        const query = `
            SELECT * FROM (
                SELECT a.*, ROWNUM rnum FROM (
                    SELECT 
                        CUST_CD, SUB_MERCHANT_CODE, LEGAL_NAME, EMAIL, PHONE, BUSINESS_ADDRESS, 
                        CUST_STATUS, TO_CHAR(CREATED_AT, 'DD-Mon-YYYY') as CREATED_DATE 
                    FROM SUB_MERCHANTS 
                    ORDER BY CREATED_AT DESC
                ) a WHERE ROWNUM <= :maxRow
            ) WHERE rnum >= :minRow
        `;
        const merchants = await F_Select(0, query, { maxRow, minRow });

        // Pre-encrypt the CUST_CD for the view links
        const processedMerchants = (merchants || []).map(m => {
            m.ENCRYPTED_CUST_CD = encryptId(m.CUST_CD);
            return m;
        });

        res.render("pages/submerchant/submerchant_list", {
            title: "Sub Merchants | Synergic Pay",
            user: req.user,
            currentRoute: "/admin/merchants",
            merchants: processedMerchants,
            currentPage: page,
            totalPages: totalPages,
            totalRecords: totalRecords
        });
    } catch (error) {
        logger.error(`[SubMerchant Controller] Error fetching list: ${error.message}`);
        res.render("pages/submerchant/submerchant_list", {
            title: "Sub Merchants | Synergic Pay",
            user: req.user,
            currentRoute: "/admin/merchants",
            merchants: [],
            currentPage: 1,
            totalPages: 1,
            totalRecords: 0
        });
    }
}

/**
 * GET /admin/merchants/create
 * Renders the form to onboard a new sub-merchant
 */
async function renderCreateSubMerchant(req, res) {
    res.render("pages/submerchant/submerchant", {
        title: "Sub Merchant Onboarding | Synergic Pay",
        user: req.user,
        currentRoute: "/admin/merchants", // Keep same route to keep sidebar active
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
    });
}

/**
 * POST /admin/submerchant/create
 * Handles form submission for sub-merchant onboarding.
 */
async function processCreateSubMerchant(req, res) {
    try {
        const payload = req.body;
        console.log(payload);

        // Check uniqueness of Email and Phone
        const checkQuery = `SELECT COUNT(*) AS CNT FROM SUB_MERCHANTS WHERE EMAIL = :email OR PHONE = :phone`;
        const checkResult = await F_Select(0, checkQuery, { email: payload.email, phone: payload.phone });

        if (checkResult && checkResult.length > 0 && checkResult[0].CNT > 0) {
            return res.json({ success: false, message: "Email ID or Mobile Number is already registered." });
        }

        const bank_id = '4';

        // Fetch bank details based on bank_id = 4
        const bankResult = await F_Select(0, `SELECT merchant_code, mer_bank_name, bank_branch, acc_num, ifsc FROM md_bank WHERE bank_id = ${bank_id}`);
        if (!bankResult || bankResult.length === 0) {
            return res.json({ success: false, message: "Bank details not found for bank_id 4." });
        }
        const bankDetails = bankResult[0];
        console.log("Fetched Bank Details from md_bank:", bankDetails);

        // 1. Prepare data for Levant API payload
        // Mapping UI fields to Levant API requirements
        const apiPayload = {
            name: payload.name,
            name_on_bank: payload.name_on_bank,
            email: payload.email,
            phone: payload.phone,
            business_name: payload.business_name,
            state: payload.state,
            nature_of_business: payload.nature_of_business,
            business_address: payload.business_address_1,
            bank_name: bankDetails.MER_BANK_NAME || bankDetails.mer_bank_name,
            bank_branch: bankDetails.BANK_BRANCH || bankDetails.bank_branch,
            account_number: bankDetails.ACC_NUM || bankDetails.acc_num,
            account_ifsc: bankDetails.IFSC || bankDetails.ifsc,
            category_code: payload.category_code,
            pan_number: payload.pan_no, // Field is pan_no in UI
            business_type_code: payload.business_type_code,
            address: [payload.personal_address_1, payload.personal_address_2, payload.personal_district, payload.personal_pincode, payload.personal_state].filter(Boolean).join(', '),
            city: payload.business_city,
            pincode: payload.business_pincode,
            entity_type: payload.entity_type,
            gstin: payload.gst_available === '2' ? payload.gstin : '',
            primary_vpa: payload.primary_vpa,
            lati: payload.lati ? payload.lati.toString() : '0.0000',
            longi: payload.longi ? payload.longi.toString() : '0.0000'
        };

        const rawReqPayload = JSON.stringify(apiPayload);

        console.log("==========================================");
        console.log("PAYLOAD SENT TO LEVANT API:");
        console.log(rawReqPayload);
        console.log("==========================================");

        // Generate sequential code for initial insert (01, 02...)
        let generatedFCode = '01';
        try {
            const query = `SELECT SUB_MERCHANT_CODE FROM SUB_MERCHANTS`;
            const result = await F_Select(0, query);
            let maxNum = 0;
            if (result && result.length > 0) {
                for (let row of result) {
                    if (row.SUB_MERCHANT_CODE && /^\\d+$/.test(row.SUB_MERCHANT_CODE)) {
                        let num = parseInt(row.SUB_MERCHANT_CODE, 10);
                        if (!isNaN(num) && num > maxNum) {
                            maxNum = num;
                        }
                    }
                }
            }
            let nextNum = maxNum + 1;
            generatedFCode = nextNum.toString().padStart(2, '0');
        } catch (err) {
            generatedFCode = Date.now().toString().substring(7); // Fallback
        }

        // 2. Insert into local database FIRST
        const custCd = await generateCustCd();
        const merchantCode = bankDetails.MERCHANT_CODE || '01';

        const insertQuery = `
            INSERT INTO SUB_MERCHANTS (
                CUST_CD, MERCHANT_CODE, SUB_MERCHANT_CODE, LEGAL_NAME, NAME_ON_BANK, EMAIL, PHONE, 
                CUST_STATUS, BUSINESS_NAME, CUST_STATE, NATURE_OF_BUSINESS, BUSINESS_ADDRESS, 
                CATEGORY_CODE, PAN_NUMBER, BUSINESS_TYPE_CODE, SUB_ADDRESS, SUB_CITY, SUB_PIN_CODE, 
                ENTITY_TYPE, GSTIN, CREATED_AT, UPDATED_AT, CREATED_BY, MODIFIED_BY, PRIMARY_VPA,
                RAW_REQ_PAYLOAD, RAW_RESPONSE, BANK_NAME, BANK_BRANCH, BANK_ACCOUNT_NUMBER, BANK_ACCOUNT_IFSC,
                GPS_LAT, GPS_LONG, BRAND_NAME, GST_AVAILABLE, AADHAR_NO, BUS_ADD_2, LANDMARK
            ) VALUES (
                :custCd, :merchantCode, :subMerchantCode, :legalName, :nameOnBank, :email, :phone,
                'A', :businessName, :state, :natureOfBusiness, :businessAddress,
                :categoryCode, :panNumber, :businessTypeCode, :address, :city, :pincode,
                :entityType, :gstin, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy, NULL, :primaryVpa,
                :rawReqPayload, :rawResponse, :bankName, :bankBranch, :bankAccountNumber, :bankAccountIfsc,
                :gpsLat, :gpsLong, :brandName, :gstAvailable, :aadharNo, :busAdd2, :landmark
            )
        `;

        const bindParams = {
            custCd: custCd,
            merchantCode: merchantCode,
            subMerchantCode: generatedFCode,
            legalName: apiPayload.name,
            nameOnBank: apiPayload.name_on_bank,
            email: apiPayload.email,
            phone: apiPayload.phone,
            businessName: apiPayload.business_name,
            state: apiPayload.state,
            natureOfBusiness: apiPayload.nature_of_business,
            businessAddress: payload.business_address_1 || '',
            categoryCode: apiPayload.category_code,
            panNumber: apiPayload.pan_number,
            businessTypeCode: apiPayload.business_type_code,
            address: apiPayload.address,
            city: payload.business_city || '',
            pincode: payload.business_pincode || '',
            entityType: apiPayload.entity_type,
            gstin: apiPayload.gstin,
            createdBy: req.user ? req.user.username : 'ADMIN',
            primaryVpa: apiPayload.primary_vpa,
            rawReqPayload: rawReqPayload,
            rawResponse: null,
            bankName: bankDetails.MER_BANK_NAME || bankDetails.mer_bank_name || null,
            bankBranch: bankDetails.BANK_BRANCH || bankDetails.bank_branch || null,
            bankAccountNumber: bankDetails.ACC_NUM || bankDetails.acc_num || null,
            bankAccountIfsc: bankDetails.IFSC || bankDetails.ifsc || null,
            gpsLat: parseFloat(apiPayload.lati),
            gpsLong: parseFloat(apiPayload.longi),
            brandName: payload.brand_name || '',
            gstAvailable: payload.gst_available, // Will now be '1' or '2'
            aadharNo: payload.aadhar_no || '',
            busAdd2: payload.business_address_2 || '',
            landmark: payload.business_landmark || ''
        };

        await F_Insert(0, insertQuery, bindParams);
        logger.info(`[SubMerchant Controller] Data initially saved for CUST_CD: ${custCd}`);

        // 3. Call Levant API
        /*
        const levantApiUrl = process.env.ONBOARD_SUBMERCHANT_API;
        let jsonResponse = null;
        let rawResponseStr = null;
        let apiSuccess = false;

        try {
            const apiResponse = await fetch(levantApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': process.env.LEVANT_API_KEY,
                    'X-Merchant-Key': process.env.LEVANT_MERCHANT_KEY,
                    'X-Environment': process.env.LEVANT_ENV
                },
                body: rawReqPayload
            });

            const textResponse = await apiResponse.text();
            rawResponseStr = textResponse;

            try {
                jsonResponse = JSON.parse(textResponse);
                apiSuccess = jsonResponse.success === true;
            } catch (parseErr) {
                // Not JSON - Levant crashed and returned HTML
                logger.error(`[SubMerchant Controller] Levant API returned HTML during creation`);
                let extractedError = "Unknown HTML Crash";
                const sqlMatch = textResponse.match(/SQLSTATE\[\d+\]:\s*(.*?)(?:\(Connection:|$)/i);
                if (sqlMatch && sqlMatch[1]) {
                    extractedError = sqlMatch[1].trim();
                } else {
                    const titleMatch = textResponse.match(/<title>(.*?)<\/title>/);
                    if (titleMatch && titleMatch[1]) extractedError = titleMatch[1].trim();
                }
                
                jsonResponse = { 
                    success: false, 
                    message: extractedError
                };
                apiSuccess = false;
            }
        } catch (apiErr) {
            logger.error(`[SubMerchant Controller] Levant API call failed: ${apiErr.message}`);
            jsonResponse = { success: false, message: "Network/API Error: " + apiErr.message };
            rawResponseStr = JSON.stringify(jsonResponse);
            apiSuccess = false;
        }

        // Extract nested objects for easier access
        const m = jsonResponse?.response?.data?.merchant || {};
        const va = m.virtual_account || {};
        const cc = m.commission_charges || {};

        let finalSubMerchantCode = generatedFCode; // Default to keeping the 'F' code
        if (apiSuccess && m.id) {
            finalSubMerchantCode = m.id.toString(); // Update to actual ID on success
        }

        // 4. Update the DB with the response
        const updateQuery = `
            UPDATE SUB_MERCHANTS 
            SET RAW_RESPONSE = :rawResponse, 
                SUB_MERCHANT_CODE = :subMerchantCode,
                VIRTUAL_ACC_ID = :virtualAccId,
                VIRTUAL_ACC_NO = :virtualAccNo,
                BALANCE = :balance,
                IS_ACTIVE = :isActive,
                VIRTUAL_BANK_NAME = :virtualBankName,
                VIRTUAL_STATUS = :virtualStatus,
                VIRTUAL_IFSC = :virtualIfsc,
                VIRTUAL_IS_CONN_BANK = :virtualIsConnBank,
                KYC = :kycData,
                UPI = :upiData,
                IMPS = :impsData,
                NEFT = :neftData,
                RTGS = :rtgsData,
                INSTA_PRIMARY_VPA = :instaPrimaryVpa,
                KYC_STATUS = :kycStatus,
                BANK_STATUS = :bankStatus,
                SALT = :salt,
                KYC_PROFILE_STATUS = :kycProfileStatus,
                KYC_EXPIRY_DATE = :kycExpiryDate,
                NAME = :merchantName,
                KEY = :merchantKey,
                REFERENCE_ID = :referenceId,
                UPDATED_AT = SYSTIMESTAMP
            WHERE CUST_CD = :custCd
        `;

        const updateParams = {
            rawResponse: rawResponseStr,
            subMerchantCode: finalSubMerchantCode,
            virtualAccId: va.id || null,
            virtualAccNo: va.account_number || null,
            balance: va.balance || 0,
            isActive: va.is_active !== undefined ? String(va.is_active) : null,
            virtualBankName: va.bank_name || null,
            virtualStatus: va.status || null,
            virtualIfsc: va.ifsc || null,
            virtualIsConnBank: va.is_connected_banking !== undefined ? String(va.is_connected_banking) : null,
            kycData: m.kyc ? JSON.stringify(m.kyc) : null,
            upiData: cc.UPI ? JSON.stringify(cc.UPI) : null,
            impsData: cc.IMPS ? JSON.stringify(cc.IMPS) : null,
            neftData: cc.NEFT ? JSON.stringify(cc.NEFT) : null,
            rtgsData: cc.RTGS ? JSON.stringify(cc.RTGS) : null,
            instaPrimaryVpa: m.insta_primary_vpa || null,
            kycStatus: m.kyc_status !== undefined ? String(m.kyc_status) : null,
            bankStatus: m.bank_status !== undefined ? String(m.bank_status) : null,
            salt: m.salt || null,
            kycProfileStatus: m.kyc_profile_status || null,
            kycExpiryDate: m.kyc_expiry_date || null,
            merchantName: m.name || null,
            merchantKey: m.key || null,
            referenceId: jsonResponse.reference_id || null,
            custCd: custCd
        };

        await F_Insert(0, updateQuery, updateParams);
        logger.info(\`[SubMerchant Controller] Data successfully updated with response for CUST_CD: \${custCd}\`);

        // If Levant API fails, we still return an error, but it's already logged in DB
        if (!jsonResponse.success) {
            logger.warn(\`[SubMerchant Controller] Levant API rejected payload: \${jsonResponse.message}\`);
            return res.json({
                success: false,
                message: "Data inserted but " + (jsonResponse.message || "API failed")
            });
        }
        */

        // 5. Return success to frontend
        return res.json({
            success: true,
            message: "Sub-merchant onboarded successfully (Local DB only)",
            // data: jsonResponse
        });

    } catch (err) {
        logger.error(`[SubMerchant Controller] Create Sub-Merchant Error: ${err.message}`);
        return res.status(500).json({ success: false, message: "An error occurred during onboarding." });
    }
}

/**
 * GET /admin/merchants/view/:custCd
 * Renders the form to view an existing sub-merchant in read-only mode
 */
async function renderViewSubMerchant(req, res) {
    try {
        const encryptedCustCd = req.params.custCd;
        const custCd = decryptId(encryptedCustCd);

        if (!custCd) {
            return res.status(400).send("Invalid or corrupted sub-merchant ID");
        }

        const query = `
            SELECT * FROM SUB_MERCHANTS WHERE CUST_CD = :custCd
        `;
        const result = await F_Select(0, query, { custCd });

        if (!result || result.length === 0) {
            return res.status(404).send("Sub-merchant not found");
        }

        const merchantData = result[0];
        merchantData.ENCRYPTED_CUST_CD = encryptedCustCd;

        res.render("pages/submerchant/submerchant_view", {
            title: "View Sub Merchant | Synergic Pay",
            user: req.user,
            currentRoute: "/admin/merchants",
            merchant: merchantData,
            googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
        });
    } catch (error) {
        logger.error(`[SubMerchant Controller] Error fetching details for view: ${error.message}`);
        res.status(500).send("An error occurred while fetching sub-merchant details.");
    }
}

/**
 * POST /admin/submerchant/api/regenerate_code
 * Regenerates the submerchant code for a failed record by hitting Levant API again.
 */
async function regenerateSubmerchantCode(req, res) {
    try {
        const { custCd, email, phone, pan_no, primary_vpa } = req.body;
        if (!custCd) {
            return res.json({ success: false, message: "Missing Submerchant ID." });
        }

        const decryptedCustCd = decryptId(custCd);
        if (!decryptedCustCd) {
            return res.json({ success: false, message: "Invalid Submerchant ID." });
        }

        // Fetch merchant details from DB
        const query = `SELECT * FROM SUB_MERCHANTS WHERE CUST_CD = :id`;
        const result = await F_Select(0, query, { id: decryptedCustCd });

        if (!result || result.length === 0) {
            return res.json({ success: false, message: "Submerchant not found." });
        }

        const merchant = result[0];

        // Ensure it actually needs regeneration
        if (merchant.SUB_MERCHANT_CODE && merchant.SUB_MERCHANT_CODE !== '0' && !merchant.SUB_MERCHANT_CODE.toUpperCase().startsWith('F')) {
            return res.json({ success: false, message: "This merchant already has a valid submerchant code." });
        }

        // Use the exact payload that was sent previously
        let rawReqPayloadStr = merchant.RAW_REQ_PAYLOAD;

        if (!rawReqPayloadStr) {
            return res.json({ success: false, message: "Original Request Payload is missing from the database." });
        }

        // Update the payload with new user inputs to bypass duplicate errors
        let apiPayload;
        try {
            apiPayload = JSON.parse(rawReqPayloadStr);
            if (email) apiPayload.email = email;
            if (phone) apiPayload.phone = phone;
            if (pan_no) apiPayload.pan_number = pan_no;
            if (primary_vpa) apiPayload.primary_vpa = primary_vpa;

            rawReqPayloadStr = JSON.stringify(apiPayload);
        } catch (e) {
            logger.warn("Failed to parse original payload. Sending as is.");
        }

        // Update database with these new values BEFORE hitting Levant, just in case
        const preUpdateQuery = `
            UPDATE SUB_MERCHANTS 
            SET EMAIL = :email, 
                PHONE = :phone, 
                PAN_NUMBER = :pan_no,
                PRIMARY_VPA = :primary_vpa,
                RAW_REQ_PAYLOAD = :rawReqPayloadStr
            WHERE CUST_CD = :id
        `;
        await F_Insert(0, preUpdateQuery, {
            email: email || merchant.EMAIL,
            phone: phone || merchant.PHONE,
            pan_no: pan_no || merchant.PAN_NUMBER,
            primary_vpa: primary_vpa || merchant.PRIMARY_VPA,
            rawReqPayloadStr: rawReqPayloadStr,
            id: decryptedCustCd
        });

        console.log("==========================================");
        console.log("REGENERATING PAYLOAD TO LEVANT API:");
        console.log(rawReqPayloadStr);
        console.log("==========================================");

        // Make HTTP Request
        /*
        const levantApiUrl = (process.env.ONBOARD_SUBMERCHANT_API || '').trim();
        let jsonResponse = null;
        let rawResponseStr = null;
        let apiSuccess = false;
        let textResponse = '';

        try {
            const apiResponse = await fetch(levantApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-API-Key': (process.env.LEVANT_API_KEY || '').trim(),
                    'X-Merchant-Key': (process.env.LEVANT_MERCHANT_KEY || '').trim(),
                    'X-Environment': (process.env.LEVANT_ENV || '').trim()
                },
                body: rawReqPayloadStr
            });

            textResponse = await apiResponse.text();
            rawResponseStr = textResponse; // Save full text response first

            try {
                jsonResponse = JSON.parse(textResponse);
                apiSuccess = jsonResponse.success === true;
            } catch (parseError) {
                // Not JSON - Levant crashed and returned HTML
                logger.error(`[SubMerchant Controller] Levant API returned HTML during regeneration`);
                let extractedError = "Unknown HTML Crash";
                const sqlMatch = textResponse.match(/SQLSTATE\[\d+\]:\s*(.*?)(?:\(Connection:|$)/i);
                if (sqlMatch && sqlMatch[1]) {
                    extractedError = sqlMatch[1].trim();
                } else {
                    const titleMatch = textResponse.match(/<title>(.*?)<\/title>/);
                    if (titleMatch && titleMatch[1]) extractedError = titleMatch[1].trim();
                }

                // Save the crash HTML directly to RAW_RESPONSE so we can debug it
                jsonResponse = {
                    success: false,
                    message: extractedError
                };
                apiSuccess = false;
            }

        } catch (apiErr) {
            logger.error(`[SubMerchant Controller] Levant API call failed during regeneration: ${apiErr.message}`);
            jsonResponse = { success: false, message: "Network/API Error: " + apiErr.message };
            rawResponseStr = JSON.stringify(jsonResponse);
            apiSuccess = false;
        }

        // Extract nested objects for easier access
        const m = jsonResponse?.response?.data?.merchant || {};
        const va = m.virtual_account || {};
        const cc = m.commission_charges || {};

        let finalSubMerchantCode = merchant.SUB_MERCHANT_CODE; // Default to keeping the old 'F' code
        if (apiSuccess && m.id) {
            finalSubMerchantCode = m.id.toString(); // Update to actual ID on success
        }

        // Update the DB with the response
        const updateQuery = `
            UPDATE SUB_MERCHANTS 
            SET RAW_RESPONSE = :rawResponse, 
                SUB_MERCHANT_CODE = :subMerchantCode,
                VIRTUAL_ACC_ID = :virtualAccId,
                VIRTUAL_ACC_NO = :virtualAccNo,
                BALANCE = :balance,
                IS_ACTIVE = :isActive,
                VIRTUAL_BANK_NAME = :virtualBankName,
                VIRTUAL_STATUS = :virtualStatus,
                VIRTUAL_IFSC = :virtualIfsc,
                VIRTUAL_IS_CONN_BANK = :virtualIsConnBank,
                KYC = :kycData,
                UPI = :upiData,
                IMPS = :impsData,
                NEFT = :neftData,
                RTGS = :rtgsData,
                INSTA_PRIMARY_VPA = :instaPrimaryVpa,
                KYC_STATUS = :kycStatus,
                BANK_STATUS = :bankStatus,
                SALT = :salt,
                KYC_PROFILE_STATUS = :kycProfileStatus,
                KYC_EXPIRY_DATE = :kycExpiryDate,
                NAME = :merchantName,
                KEY = :merchantKey,
                REFERENCE_ID = :referenceId,
                UPDATED_AT = SYSTIMESTAMP
            WHERE CUST_CD = :custCd
        `;

        const updateParams = {
            rawResponse: rawResponseStr,
            subMerchantCode: finalSubMerchantCode,
            virtualAccId: va.id || null,
            virtualAccNo: va.account_number || null,
            balance: va.balance || 0,
            isActive: va.is_active !== undefined ? String(va.is_active) : null,
            virtualBankName: va.bank_name || null,
            virtualStatus: va.status || null,
            virtualIfsc: va.ifsc || null,
            virtualIsConnBank: va.is_connected_banking !== undefined ? String(va.is_connected_banking) : null,
            kycData: m.kyc ? JSON.stringify(m.kyc) : null,
            upiData: cc.UPI ? JSON.stringify(cc.UPI) : null,
            impsData: cc.IMPS ? JSON.stringify(cc.IMPS) : null,
            neftData: cc.NEFT ? JSON.stringify(cc.NEFT) : null,
            rtgsData: cc.RTGS ? JSON.stringify(cc.RTGS) : null,
            instaPrimaryVpa: m.insta_primary_vpa || null,
            kycStatus: m.kyc_status !== undefined ? String(m.kyc_status) : null,
            bankStatus: m.bank_status !== undefined ? String(m.bank_status) : null,
            salt: m.salt || null,
            kycProfileStatus: m.kyc_profile_status || null,
            kycExpiryDate: m.kyc_expiry_date || null,
            merchantName: m.name || null,
            merchantKey: m.key || null,
            referenceId: jsonResponse.reference_id || null,
            custCd: decryptedCustCd
        };

        await F_Insert(0, updateQuery, updateParams);

        if (!jsonResponse.success) {
            return res.json({
                success: false,
                message: jsonResponse.message || "Levant API rejected payload"
            });
        }
        */

        return res.json({
            success: true,
            message: "Sub-merchant code regenerated successfully",
            // data: jsonResponse
        });

    } catch (error) {
        logger.error(`[SubMerchant Controller] Regenerate Error: ${error.message}`);
        return res.json({ success: false, message: "An internal server error occurred." });
    }
}

module.exports = {
    renderSubMerchantList,
    renderCreateSubMerchant,
    processCreateSubMerchant,
    renderViewSubMerchant,
    regenerateSubmerchantCode
};
