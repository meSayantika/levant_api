// Inside controllers/api/v1/webhookController.js
const { F_Insert } = require("../../../models/oracleModel");

const DB_ID = 0;

// Helper: Safely trim strings to prevent Oracle "ORA-12899: value too large" crashes
const safeString = (str, maxLength = 200) => {
    if (str === null || str === undefined) return null;
    return String(str).substring(0, maxLength);
};

// Helper: Format Levant's timestamps to Oracle TO_DATE format ("YYYY-MM-DD HH24:MI:SS")
// Ensures full datetime (with time) is always returned, never date-only.
const formatLevantDate = (input) => {
    if (!input) return null;
    
    let str = String(input).trim();
    
    // Handle numeric epoch timestamps (milliseconds)
    if (/^\d{10,13}$/.test(str)) {
        const ms = str.length <= 10 ? Number(str) * 1000 : Number(str);
        const d = new Date(ms);
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0') + ' ' +
            String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0') + ':' +
            String(d.getSeconds()).padStart(2, '0');
    }
    
    // Replace 'T' separator with space (ISO 8601)
    str = str.replace('T', ' ');
    
    // Take only "YYYY-MM-DD HH:MI:SS" (first 19 chars) — strips timezone/ms
    str = str.substring(0, 19);
    
    // If only date was provided (e.g. "2026-06-02"), pad with time
    if (str.length === 10) {
        str += ' 00:00:00';
    }
    
    return str;
};

// Helper: Format Levant's timestamps for Oracle TIMESTAMP(6) columns
// Preserves microseconds (fractional seconds) — output: "YYYY-MM-DD HH24:MI:SS.FF6"
const formatLevantTimestamp = (input) => {
    if (!input) return null;
    
    let str = String(input).trim();
    
    // Handle numeric epoch timestamps
    if (/^\d{10,13}$/.test(str)) {
        const ms = str.length <= 10 ? Number(str) * 1000 : Number(str);
        const d = new Date(ms);
        const microseconds = String(d.getMilliseconds()).padStart(3, '0') + '000';
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0') + ' ' +
            String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0') + ':' +
            String(d.getSeconds()).padStart(2, '0') + '.' + microseconds;
    }
    
    // Replace 'T' separator with space
    str = str.replace('T', ' ');
    
    // Extract datetime + fractional seconds, strip timezone
    // e.g. "2026-05-27 08:08:44.956896+05:30" → "2026-05-27 08:08:44.956896"
    const match = str.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(\.\d+)?/);
    if (match) {
        const datePart = match[1];  // "2026-05-27 08:08:44"
        let fracPart = match[2] || '.000000';  // ".956896" or default
        fracPart = (fracPart + '000000').substring(0, 7); // Pad/trim to ".XXXXXX" (6 digits)
        return datePart + fracPart;
    }
    
    // Fallback: date-only input
    if (str.length === 10) {
        return str + ' 00:00:00.000000';
    }
    
    return str.substring(0, 26);
};

exports.kycReceiver = async (req, res) => {
    try {
        let payload;

        if (req.method === 'GET') {
            payload = req.query;

            if (payload.data && typeof payload.data === 'string') {
                try {
                    payload.data = JSON.parse(payload.data);
                } catch (parseErr) {
                    console.warn("Could not parse GET query data as JSON.");
                }
            }
        } else {
            // For POST, PUT, PATCH, etc.
            payload = req.body;
        }
        
        if (!payload || !payload.data) {
            return res.status(400).json({ success: false, message: "Invalid payload format" });
        }
        
        // Immediately acknowledge receipt
        res.status(200).json({ success: true, message: "KYC Webhook received" });

        const data = payload.data;
        console.log(`Processing KYC for Merchant ID: ${data.id}`);

        // Build the full INSERT SQL statement
        // NOTE: Bind names avoid Oracle reserved words (e.g. :txn_status instead of :status)
        const insertQuery = `
            INSERT INTO td_kyc_approval (
                SUBMERCHANT_ID, VIRTUAL_ACC_ID, VIRTUAL_ACC_NO, BALANCE, IS_ACTIVE, 
                BANK_NAME, STATUS, IFSC, IS_CONNECTED_BANKING, INSTA_PRIMARY_VPA, 
                KYC_STATUS, BANK_STATUS, KYC_PROFILE_STATUS, KYC_EXPIRTY_DT, 
                STORE_NAME, CREATED_BY, CREATED_AT, KYC, UPI, IMPS, NEFT, RTGS
            ) VALUES (
                :sub_id, :v_acc_id, :v_acc_no, :balance, :is_active, 
                :bank_name, :txn_status, :ifsc, :is_conn_bnk, :insta_vpa, 
                :kyc_status, :bank_status, :kyc_prof_status, TO_DATE(:kyc_exp_dt, 'YYYY-MM-DD HH24:MI:SS'), 
                :store_name, :created_by, SYSDATE, :kyc_data, :upi_data, :imps_data, :neft_data, :rtgs_data
            )
        `;

        // Map payload data — use safeString() to truncate to column limits
        const kycValues = {
            sub_id: safeString(data.id, 50),
            v_acc_id: safeString(data.virtual_account?.id, 1000),
            v_acc_no: safeString(data.virtual_account?.account_number, 1000),
            balance: data.virtual_account?.balance || 0,
            is_active: data.virtual_account?.is_active ? 'TRUE' : 'FALSE',
            bank_name: safeString(data.virtual_account?.bank_name, 1000),
            txn_status: safeString(data.virtual_account?.status, 30),
            ifsc: safeString(data.virtual_account?.ifsc, 1000),
            is_conn_bnk: data.virtual_account?.is_connected_banking ? 'TRUE' : 'FALSE',
            insta_vpa: safeString(data.insta_primary_vpa, 1000),
            kyc_status: data.kyc_status ? 'TRUE' : 'FALSE',
            bank_status: data.bank_status ? 'TRUE' : 'FALSE',
            kyc_prof_status: safeString(data.kyc_profile_status, 30),
            kyc_exp_dt: data.kyc_expiry_date || null, 
            store_name: safeString(data.name, 1000),
            created_by: 'LEVANT_WEBHOOK',
            
            // Convert entire arrays into stringified JSON. 
            // If the array doesn't exist in the payload, it inserts NULL.
            kyc_data: data.kyc ? JSON.stringify(data.kyc) : null,
            upi_data: data.commission_charges?.UPI ? JSON.stringify(data.commission_charges.UPI) : null,
            imps_data: data.commission_charges?.IMPS ? JSON.stringify(data.commission_charges.IMPS) : null,
            neft_data: data.commission_charges?.NEFT ? JSON.stringify(data.commission_charges.NEFT) : null,
            rtgs_data: data.commission_charges?.RTGS ? JSON.stringify(data.commission_charges.RTGS) : null
        };

        // Insert into td_kyc_approval — F_Insert(dbId, query, params)
        const insertLog = await F_Insert(DB_ID, insertQuery, kycValues);
        // const insertLog = 'test';
        console.log(`Successfully inserted into td_kyc_approval. Rows affected: ${insertLog.rowsAffected}`);

    } catch (error) {
        console.error("KYC Webhook Error:", error);
    }
};


// --- 2. TRANSACTION WEBHOOK HANDLER ---
exports.transactionReceiver = async (req, res) => {
    try {
        let payload;

        if (req.method === 'GET') {
            payload = req.query;
            
        //     //If Levant passes complex JSON inside a GET URL, convert it back to a real object
            if (payload.data && typeof payload.data === 'string') {
                try {
                    payload.data = JSON.parse(payload.data);
                } catch (parseErr) {
                    console.warn("Could not parse GET query data as JSON.");
                }
            }
        } else {
            // For POST, PUT, PATCH, etc.
            payload = req.body;
        }
        
        if (!payload || !payload.data) {
            return res.status(400).json({ success: false, message: "Invalid payload format" });
        }
        
        // Immediately acknowledge receipt to Levant
        res.status(200).json({ success: true, message: "Transaction Webhook received" });

        const data = payload.data;
        console.log(`Processing Transaction Credit. UTR: ${data.unique_transaction_reference}, Amount: ${data.amount}`);

        // Build the full INSERT SQL statement
        // NOTE: Bind names avoid Oracle reserved words (e.g. :pay_mode not :mode, :txn_status not :status)
        const insertQuery = `
            INSERT INTO td_transaction_credit (
                TRANS_ID, TRANS_CREATED_AT, REMITTER_FULL_NAME, REMITTER_UPI_HANDLE, 
                REMITTER_ACC_NO, REMITTER_ACC_IFSC, REMITTER_PHONE_NO, UNIQUE_TRANSACTION_REFF, 
                PAYMENT_MODE, AMOUNT, SERVICE_CHARGE, GST_AMOUNT, SERVICE_CHARGE_WITH_GST, 
                NARRATION, STATUS, TRANSACTION_DT, SETTLEMENT_DT, 
                VIRTUAL_ACC_ID, VIRTUAL_ACC_LABEL, VIRTUAL_ACC_NUMBER, VIRTUAL_IFSC_NO, 
                VIRTUAL_UPI_HANDLE, UPI_PARAMS_TR, UPI_PARAMS_TID, IS_CC_ON_UPI, 
                AUTHORIZATION, CREATED_BY, CREATED_AT
            ) VALUES (
                :t_id, TO_DATE(:t_created, 'YYYY-MM-DD HH24:MI:SS'), :r_name, :r_upi, 
                :r_acc, :r_ifsc, :r_phone, :utr, :pay_mode, :amt, :schg, :gst, :schg_gst, 
                :narr, :txn_status, TO_DATE(:t_dt, 'YYYY-MM-DD HH24:MI:SS'), TO_DATE(:settle_dt, 'YYYY-MM-DD HH24:MI:SS'), 
                :v_acc_id, :v_acc_lbl, :v_acc_no, :v_ifsc, :v_upi, :upi_tr, :upi_tid, :is_cc, 
                :auth, :c_by, SYSDATE
            )
        `;

        // Map payload to table definition — limits match actual column widths
        const transValues = {
            t_id: safeString(data.id, 100),                                      // VARCHAR2(100)
            t_created: formatLevantDate(data.created_at),                        // DATE
            r_name: safeString(data.remitter_full_name, 1000),                   // VARCHAR2(1000)
            r_upi: safeString(data.remitter_upi_handle, 1000),                  // VARCHAR2(1000)
            r_acc: safeString(data.remitter_account_number, 1000),               // VARCHAR2(1000)
            r_ifsc: safeString(data.remitter_account_ifsc, 1000),                // VARCHAR2(1000)
            r_phone: safeString(data.remitter_phone_number, 30),                 // VARCHAR2(30)
            utr: data.unique_transaction_reference ? Number(data.unique_transaction_reference) : null, // NUMBER
            pay_mode: safeString(data.payment_mode, 30),                         // VARCHAR2(30)
            amt: data.amount || 0,                                               // NUMBER(10,2)
            schg: data.service_charge || 0,                                      // NUMBER(10,2)
            gst: data.gst_amount || 0,                                           // NUMBER(10,2)
            schg_gst: data.service_charge_with_gst || 0,                         // NUMBER(10,2)
            narr: safeString(data.narration, 1000),                              // VARCHAR2(1000)
            txn_status: safeString(data.status, 30),                             // VARCHAR2(30)
            t_dt: formatLevantDate(data.transaction_date),                       // DATE
            settle_dt: formatLevantDate(data.settlement_date),                   // DATE
            
            // Virtual Account Details
            v_acc_id: safeString(data.virtual_account?.id, 1000),                // VARCHAR2(1000)
            v_acc_lbl: safeString(data.virtual_account?.label, 1000),            // VARCHAR2(1000)
            v_acc_no: safeString(data.virtual_account?.virtual_account_number, 1000), // VARCHAR2(1000)
            v_ifsc: safeString(data.virtual_account?.virtual_ifsc_number, 1000), // VARCHAR2(1000)
            v_upi: safeString(data.virtual_account?.virtual_upi_handle, 1000),  // VARCHAR2(1000)
            
            // Metadata (UPI Params)
            upi_tr: safeString(data.metadata?.upi_params_tr, 1000),              // VARCHAR2(1000)
            upi_tid: safeString(data.metadata?.upi_params_tid, 1000),            // VARCHAR2(1000)
            
            // Other details
            is_cc: safeString(data.is_cc_on_upi, 30),                           // VARCHAR2(30)
            auth: safeString(data.Authorization, 1000),                          // VARCHAR2(1000)
            c_by: 'LEVANT_WEBHOOK'                                               // VARCHAR2(1000)

        };

        // Execute DB Insert — F_Insert(dbId, query, params)
        const insertResult = await F_Insert(DB_ID, insertQuery, transValues);

        console.log(`Successfully inserted into td_transaction_credit. Rows affected: ${insertResult.rowsAffected}`);

    } catch (error) { 
        console.error("Transaction Webhook Error:", error); 
    }
};

// --- 3. SETTLEMENT INITIATED HANDLER ---
exports.settlementInitiateReceiver = async (req, res) => {
    try {
        let payload;

        if (req.method === 'GET') {
            payload = req.query;
            
        //     //If Levant passes complex JSON inside a GET URL, convert it back to a real object
            if (payload.data && typeof payload.data === 'string') {
                try {
                    payload.data = JSON.parse(payload.data);
                } catch (parseErr) {
                    console.warn("Could not parse GET query data as JSON.");
                }
            }
        } else {
            // For POST, PUT, PATCH, etc.
            payload = req.body;
        }
        
        if (!payload || !payload.data) {
            return res.status(400).json({ success: false, message: "Invalid payload format" });
        }
        
        // Immediately acknowledge receipt to Levant
        res.status(200).json({ success: true, message: "Settlement Initiate received" });

        const data = payload.data;
        console.log(`Processing Settlement Initiated. ID: ${data.id}, Amount: ${data.amount}`);

        // Build the full INSERT SQL statement
        // Uses TO_TIMESTAMP (not TO_DATE) because columns are TIMESTAMP(6)
        const insertQuery = `
            INSERT INTO td_settlement_initiated (
                SETTLE_INITIATE_ID, SETTLE_INITIATED_CREATED_AT, DISBURSEMENT_TYPE, 
                BENIFICIARY_BANK_NAME, BENIFICIARY_ACC_NAME, BENIFICIARY_ACC_NO, 
                BENIFICIARY_ACC_IFSC, BENIFICIARY_UPI_HANDLE, UNIQUE_TRANSACTION_REFF, 
                PAYMENT_MODE, CURRENCY, AMOUNT, SERVICE_CHARGE, GST_AMOUNT, 
                SERVICE_CHARGE_WITH_GST, NARRATION, STATUS, FALIURE_REASON, 
                DISBURSEMENT_DATE, AUTHORIZATION, MERCHANT_NAME, MERCHANT_EMAIL, 
                MERCHANT_ID, CREATED_BY, CREATED_AT
            ) VALUES (
                :s_id, TO_TIMESTAMP(:s_created, 'YYYY-MM-DD HH24:MI:SS.FF6'), :d_type, 
                :b_bank, :b_name, :b_acc, :b_ifsc, :b_upi, :utr, :pay_mode, :curr, 
                :amt, :schg, :gst, :schg_gst, :narr, :txn_status, :fail_rsn, 
                TO_TIMESTAMP(:d_date, 'YYYY-MM-DD HH24:MI:SS.FF6'), :auth, :m_name, :m_email, 
                :m_id, :c_by, SYSTIMESTAMP
            )
        `;

        // Map payload to table definition — limits match actual column widths
        const settleValues = {
            s_id: safeString(data.id, 1000),                                     // VARCHAR2(1000)
            s_created: formatLevantTimestamp(data.created_at),                   // TIMESTAMP(6)
            d_type: safeString(data.disbursement_type, 100),                     // VARCHAR2(100)
            b_bank: safeString(data.beneficiary_bank_name, 1000),                // VARCHAR2(1000)
            b_name: safeString(data.beneficiary_account_name, 1000),             // VARCHAR2(1000)
            b_acc: safeString(data.beneficiary_account_number, 1000),            // VARCHAR2(1000)
            b_ifsc: safeString(data.beneficiary_account_ifsc, 1000),             // VARCHAR2(1000)
            b_upi: safeString(data.beneficiary_upi_handle, 1000),               // VARCHAR2(1000)
            utr: safeString(data.unique_transaction_reference, 100),             // VARCHAR2(100)
            pay_mode: safeString(data.payment_mode, 30),                         // VARCHAR2(30)
            curr: safeString(data.currency, 10),                                 // VARCHAR2(10)
            amt: data.amount || 0,                                               // NUMBER(10,2)
            schg: data.service_charge || 0,                                      // NUMBER(10,2)
            gst: data.gst_amount || 0,                                           // NUMBER(10,2)
            schg_gst: data.service_charge_with_gst || 0,                         // NUMBER(10,2)
            narr: safeString(data.narration, 1000),                              // VARCHAR2(1000)
            txn_status: safeString(data.status, 10),                             // VARCHAR2(10)
            fail_rsn: safeString(data.failure_reason, 1000),                     // VARCHAR2(1000)
            d_date: formatLevantTimestamp(data.disbursement_date),               // TIMESTAMP(6)
            auth: safeString(data.Authorization, 1000),                          // VARCHAR2(1000)
            
            // Nested Merchant Object
            m_name: safeString(data.merchant?.name, 1000),                       // VARCHAR2(1000)
            m_email: safeString(data.merchant?.email, 1000),                     // VARCHAR2(1000)
            m_id: safeString(data.merchant?.id, 1000),                           // VARCHAR2(1000)
            
            c_by: 'LEVANT_WEBHOOK'                                               // VARCHAR2(1000)
        };

        // Execute DB Insert — F_Insert(dbId, query, params)
        const insertResult = await F_Insert(DB_ID, insertQuery, settleValues);

        console.log(`Successfully inserted into td_settlement_initiated. Rows affected: ${insertResult.rowsAffected}`);

    } catch (error) { 
        console.error("Settlement Initiate Error:", error); 
    }
};

// --- 4. SETTLEMENT STATUS UPDATE HANDLER ---
exports.settlementUpdateReceiver = async (req, res) => {
    try {
        let payload;

        if (req.method === 'GET') {
            payload = req.query;
            
        //     // If Levant passes complex JSON inside a GET URL, convert it back to a real object
            if (payload.data && typeof payload.data === 'string') {
                try {
                    payload.data = JSON.parse(payload.data);
                } catch (parseErr) {
                    console.warn("Could not parse GET query data as JSON.");
                }
            }
        } else {
            // For POST, PUT, PATCH, etc.
            payload = req.body;
        }
        
        if (!payload || !payload.data) {
            return res.status(400).json({ success: false, message: "Invalid payload format" });
        }
        
        // Immediately acknowledge receipt to Levant
        res.status(200).json({ success: true, message: "Settlement Update received" });

        const data = payload.data;
        console.log(`Processing Settlement Update. ID: ${data.id}, Status: ${data.status}`);

        // Build the full INSERT SQL statement
        const insertQuery = `
            INSERT INTO td_settlement_approval (
                SETTLEMENT_STATUS_ID, SETTLEMENT_STATUS_CREATED_AT, DISBURSEMENT_TYPE, 
                BENIFICIARY_BANK_NAME, BENIFICIARY_ACC_NAME, BENIFICIARY_ACC_NO, 
                BENIFICIARY_ACC_IFSC, BENIFICIARY_UPI_HANDLE, UNIQUE_TRANSACTION_REFF, 
                PAYMENT_MODE, CURRENCY, AMOUNT, SERVICE_CHARGE, GST_AMOUNT, 
                SERVICE_CHARGE_WITH_GST, NARRATION, STATUS, FALIURE_REASON, 
                DISBURSEMENT_DATE, AUTHORIZATION, MERCHANT_NAME, MERCHANT_EMAIL, 
                MERCHANT_ID, CREATED_BY, CREATED_AT
            ) VALUES (
                :s_id, TO_TIMESTAMP(:s_created, 'YYYY-MM-DD HH24:MI:SS.FF6'), :d_type, 
                :b_bank, :b_name, :b_acc, :b_ifsc, :b_upi, :utr, :pay_mode, :curr, 
                :amt, :schg, :gst, :schg_gst, :narr, :txn_status, :fail_rsn, 
                TO_TIMESTAMP(:d_date, 'YYYY-MM-DD HH24:MI:SS.FF6'), :auth, :m_name, :m_email, 
                :m_id, :c_by, SYSTIMESTAMP
            )
        `;

        // Map payload to table definition — limits match actual column widths
        const settleValues = {
            s_id: safeString(data.id, 1000),                                     // VARCHAR2(1000)
            s_created: formatLevantTimestamp(data.created_at),                   // TIMESTAMP(6)
            d_type: safeString(data.disbursement_type, 100),                     // VARCHAR2(100)
            b_bank: safeString(data.beneficiary_bank_name, 1000),                // VARCHAR2(1000)
            b_name: safeString(data.beneficiary_account_name, 1000),             // VARCHAR2(1000)
            b_acc: safeString(data.beneficiary_account_number, 1000),            // VARCHAR2(1000)
            b_ifsc: safeString(data.beneficiary_account_ifsc, 1000),             // VARCHAR2(1000)
            b_upi: safeString(data.beneficiary_upi_handle, 1000),               // VARCHAR2(1000)
            utr: safeString(data.unique_transaction_reference, 100),             // VARCHAR2(100)
            pay_mode: safeString(data.payment_mode, 30),                         // VARCHAR2(30)
            curr: safeString(data.currency, 10),                                 // VARCHAR2(10)
            amt: data.amount || 0,                                               // NUMBER(10,2)
            schg: data.service_charge || 0,                                      // NUMBER(10,2)
            gst: data.gst_amount || 0,                                           // NUMBER(10,2)
            schg_gst: data.service_charge_with_gst || 0,                         // NUMBER(10,2)
            narr: safeString(data.narration, 1000),                              // VARCHAR2(1000)
            txn_status: safeString(data.status, 10),                             // VARCHAR2(10)
            fail_rsn: safeString(data.failure_reason, 1000),                     // VARCHAR2(1000)
            d_date: formatLevantTimestamp(data.disbursement_date),               // TIMESTAMP(6)
            auth: safeString(data.Authorization, 1000),                          // VARCHAR2(1000)
            
            // Nested Merchant Object
            m_name: safeString(data.merchant?.name, 1000),                       // VARCHAR2(1000)
            m_email: safeString(data.merchant?.email, 1000),                     // VARCHAR2(1000)
            m_id: safeString(data.merchant?.id, 1000),                           // VARCHAR2(1000)
            
            c_by: 'LEVANT_WEBHOOK'                                               // VARCHAR2(1000)
        };

        // Execute DB Insert — F_Insert(dbId, query, params)
        const insertResult = await F_Insert(DB_ID, insertQuery, settleValues);

        console.log(`Successfully inserted into td_settlement_approval. Rows affected: ${insertResult.rowsAffected}`);

    } catch (error) { 
        console.error("Settlement Update Error:", error); 
    }
};