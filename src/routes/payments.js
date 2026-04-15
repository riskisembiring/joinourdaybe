/*  */const crypto = require("crypto");
const https = require("https");
const express = require("express");
const {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} = require("firebase/firestore");
const { db } = require("../config/firebase");
const {
  midtransConfig,
  getMissingMidtransEnvVars,
  getMidtransDiagnostics,
} = require("../config/midtrans");
const { notifyAdminOnSettlement } = require("../services/adminNotifications");

const router = express.Router();
const paymentsCollection = collection(db, "payments");

function normalizeLimit(value, fallback = 20, max = 100) {
  const parsedValue = Number.parseInt(value, 10);

  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return Math.min(parsedValue, max);
}

function getPackageName(payment) {
  if (payment.metadata?.paket) {
    return payment.metadata.paket;
  }

  if (payment.metadata?.packageName) {
    return payment.metadata.packageName;
  }

  if (Array.isArray(payment.itemDetails) && payment.itemDetails.length > 0) {
    return payment.itemDetails[0]?.name || null;
  }

  return null;
}

function formatPaymentTime(timestamp) {
  if (!timestamp) {
    return null;
  }

  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().toISOString();
  }

  if (typeof timestamp.seconds === "number") {
    return new Date(timestamp.seconds * 1000).toISOString();
  }

  return null;
}

function serializePayment(payment) {
  const email = payment.userEmail || payment.customerDetails?.email || payment.metadata?.email || null;
  const pembeli = {
    nama:
      payment.userName ||
      payment.customerDetails?.first_name ||
      payment.metadata?.nama ||
      null,
    paket: getPackageName(payment),
    waktu: formatPaymentTime(payment.createdAt),
  };

  return {
    id: payment.id || payment.orderId || null,
    orderId: payment.orderId || null,
    amount: payment.amount ?? null,
    status: payment.status || null,
    midtransTransactionStatus: payment.midtransTransactionStatus || null,
    paymentType: payment.paymentType || null,
    transactionId: payment.transactionId || null,
    fraudStatus: payment.fraudStatus || null,
    lastStatusSource: payment.lastStatusSource || null,
    token: payment.token || null,
    redirectUrl: payment.redirectUrl || null,
    userId: payment.userId || null,
    email,
    userEmail: email,
    pembeli,
    userName: payment.userName || null,
    customerDetails: payment.customerDetails || {},
    itemDetails: payment.itemDetails || [],
    metadata: payment.metadata || {},
    createdAt: payment.createdAt || null,
    updatedAt: payment.updatedAt || null,
  };
}

function getTimestampValue(timestamp) {
  if (!timestamp) {
    return 0;
  }

  if (typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }

  if (typeof timestamp.seconds === "number") {
    return timestamp.seconds * 1000;
  }

  return 0;
}

function sortPaymentsByNewest(payments) {
  return [...payments].sort(
    (left, right) =>
      Math.max(getTimestampValue(right.updatedAt), getTimestampValue(right.createdAt)) -
      Math.max(getTimestampValue(left.updatedAt), getTimestampValue(left.createdAt))
  );
}

function normalizeMidtransStatus(transactionStatus, fraudStatus) {
  if (!transactionStatus) {
    return null;
  }

  if (transactionStatus === "capture" && (!fraudStatus || fraudStatus === "accept")) {
    return "settlement";
  }

  return transactionStatus;
}

function buildMidtransPaymentUpdate({
  orderId,
  transactionStatus,
  paymentType,
  transactionId,
  fraudStatus,
  payloadField,
  payload,
  source,
}) {
  return {
    orderId,
    status: normalizeMidtransStatus(transactionStatus, fraudStatus),
    midtransTransactionStatus: transactionStatus || null,
    paymentType: paymentType || null,
    transactionId: transactionId || null,
    fraudStatus: fraudStatus || null,
    lastStatusSource: source,
    [payloadField]: payload,
    updatedAt: serverTimestamp(),
  };
}

async function upsertPaymentStatus(orderId, paymentData) {
  const paymentRef = doc(paymentsCollection, orderId);
  const paymentSnapshot = await getDoc(paymentRef);

  if (paymentSnapshot.exists()) {
    await updateDoc(paymentRef, paymentData);
    return;
  }

  await setDoc(paymentRef, {
    id: orderId,
    createdAt: serverTimestamp(),
    ...paymentData,
  });
}

async function processSettlementAdminNotifications(orderId, paymentData) {
  if (paymentData.status !== "settlement") {
    return;
  }

  const paymentRef = doc(paymentsCollection, orderId);
  const paymentSnapshot = await getDoc(paymentRef);

  if (!paymentSnapshot.exists()) {
    return;
  }

  const payment = paymentSnapshot.data();
  const notificationState = payment.adminNotifications?.settlement || {};
  const needsEmail = !notificationState.emailSentAt;
  const needsWhatsApp = !notificationState.whatsappSentAt;

  if (!needsEmail && !needsWhatsApp) {
    return;
  }

  const { updates, results } = await notifyAdminOnSettlement(payment);

  await updateDoc(paymentRef, updates);

  console.info("[payments] settlement admin notifications processed", {
    orderId,
    email: results.email,
    whatsapp: results.whatsapp,
  });
}

function createMidtransContext(overrides = {}) {
  return {
    ...getMidtransDiagnostics(),
    ...overrides,
  };
}

function sendMidtransRequest(urlString, method = "GET", payload) {
  const url = new URL(urlString);
  const authorization = Buffer.from(`${midtransConfig.serverKey}:`).toString("base64");
  const requestBody = payload ? JSON.stringify(payload) : null;
  const headers = {
    Accept: "application/json",
    Authorization: `Basic ${authorization}`,
  };

  if (requestBody) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(requestBody);
  }

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      },
      (response) => {
        let responseBody = "";

        response.on("data", (chunk) => {
          responseBody += chunk;
        });

        response.on("end", () => {
          const parsedBody = responseBody ? JSON.parse(responseBody) : {};

          if (response.statusCode >= 200 && response.statusCode < 300) {
            return resolve(parsedBody);
          }

          const error = new Error(
            parsedBody.error_messages?.join(", ") || parsedBody.status_message || "Midtrans request failed."
          );
          error.statusCode = response.statusCode;
          error.responseBody = parsedBody;
          error.url = urlString;

          return reject(error);
        });
      }
    );

    request.on("error", reject);

    if (requestBody) {
      request.write(requestBody);
    }

    request.end();
  });
}

function buildSignature(orderId, statusCode, grossAmount) {
  return crypto
    .createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${midtransConfig.serverKey}`)
    .digest("hex");
}

router.post("/midtrans/token", async (req, res) => {
  try {
    const missingEnvVars = getMissingMidtransEnvVars();

    if (missingEnvVars.length > 0) {
      return res.status(500).json({
        message: "Midtrans configuration is incomplete.",
        error: `Missing environment variables: ${missingEnvVars.join(", ")}`,
      });
    }

    const {
      orderId,
      amount,
      itemDetails = [],
      customerDetails = {},
      enabledPayments,
      callbacks,
      expiry,
      metadata = {},
    } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        message: "amount must be greater than 0.",
      });
    }

    const normalizedOrderId =
      orderId?.trim() || `ORDER-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

    const grossAmount = Number(amount);
    const diagnostics = createMidtransContext({
      orderId: normalizedOrderId,
      amount: grossAmount,
    });
    const paymentOwner = {
      userId: metadata.userId || null,
      userEmail: customerDetails.email || metadata.email || null,
      userName: customerDetails.first_name || metadata.nama || null,
    };
    const snapPayload = {
      transaction_details: {
        order_id: normalizedOrderId,
        gross_amount: grossAmount,
      },
    };

    if (Array.isArray(itemDetails) && itemDetails.length > 0) {
      snapPayload.item_details = itemDetails;
    }

    if (customerDetails && Object.keys(customerDetails).length > 0) {
      snapPayload.customer_details = customerDetails;
    }

    if (Array.isArray(enabledPayments) && enabledPayments.length > 0) {
      snapPayload.enabled_payments = enabledPayments;
    }

    if (callbacks && Object.keys(callbacks).length > 0) {
      snapPayload.callbacks = callbacks;
    }

    if (expiry && Object.keys(expiry).length > 0) {
      snapPayload.expiry = expiry;
    }

    const midtransResponse = await sendMidtransRequest(
      midtransConfig.snapBaseUrl,
      "POST",
      snapPayload
    );

    console.info("[midtrans] snap token created", {
      ...diagnostics,
      hasToken: Boolean(midtransResponse.token),
      redirectHost: midtransResponse.redirect_url ? new URL(midtransResponse.redirect_url).hostname : null,
    });

    await setDoc(doc(paymentsCollection, normalizedOrderId), {
      id: normalizedOrderId,
      orderId: normalizedOrderId,
      amount: grossAmount,
      status: "pending",
      paymentType: null,
      transactionId: null,
      token: midtransResponse.token || null,
      redirectUrl: midtransResponse.redirect_url || null,
      userId: paymentOwner.userId,
      userEmail: paymentOwner.userEmail,
      userName: paymentOwner.userName,
      itemDetails,
      customerDetails,
      enabledPayments: enabledPayments || [],
      metadata,
      midtransResponse,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return res.status(201).json({
      message: "Midtrans transaction created successfully.",
      data: {
        orderId: normalizedOrderId,
        token: midtransResponse.token,
        redirectUrl: midtransResponse.redirect_url,
        clientKey: midtransConfig.clientKey,
        isProduction: midtransConfig.isProduction,
        environment: midtransConfig.environment,
        diagnostics,
      },
    });
  } catch (error) {
    console.error("[midtrans] failed to create snap token", createMidtransContext({
      orderId: req.body?.orderId || null,
      amount: req.body?.amount ? Number(req.body.amount) : null,
      statusCode: error.statusCode || null,
      midtransMessage: error.message,
      midtransResponse: error.responseBody || null,
      url: error.url || midtransConfig.snapBaseUrl,
    }));

    return res.status(500).json({
      message: "Failed to create Midtrans transaction.",
      error: error.message,
      diagnostics: createMidtransContext({
        orderId: req.body?.orderId || null,
        url: error.url || midtransConfig.snapBaseUrl,
      }),
    });
  }
});

router.post("/midtrans/notification", async (req, res) => {
  try {
    const missingEnvVars = getMissingMidtransEnvVars();

    if (missingEnvVars.length > 0) {
      return res.status(500).json({
        message: "Midtrans configuration is incomplete.",
        error: `Missing environment variables: ${missingEnvVars.join(", ")}`,
      });
    }

    const {
      order_id: orderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: signatureKey,
      transaction_status: transactionStatus,
      payment_type: paymentType,
      transaction_id: transactionId,
      fraud_status: fraudStatus,
    } = req.body;

    const missingFields = [
      ["order_id", orderId],
      ["status_code", statusCode],
      ["gross_amount", grossAmount],
      ["signature_key", signatureKey],
    ]
      .filter(([, value]) => !value)
      .map(([field]) => field);

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: "Midtrans notification payload is incomplete.",
        error: `Missing required fields: ${missingFields.join(", ")}. This endpoint is intended for Midtrans webhook requests, not direct frontend calls.`,
      });
    }

    const expectedSignature = buildSignature(orderId, statusCode, grossAmount);

    if (signatureKey !== expectedSignature) {
      return res.status(403).json({
        message: "Invalid Midtrans signature.",
      });
    }

    const paymentData = buildMidtransPaymentUpdate({
      orderId,
      transactionStatus,
      paymentType,
      transactionId,
      fraudStatus,
      payloadField: "notificationPayload",
      payload: req.body,
      source: "midtrans_notification",
    }
    );

    await upsertPaymentStatus(orderId, paymentData);
    await processSettlementAdminNotifications(orderId, paymentData);

    return res.status(200).json({
      message: "Midtrans notification processed successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to process Midtrans notification.",
      error: error.message,
    });
  }
});

router.get("/midtrans/status/:orderId", async (req, res) => {
  try {
    const missingEnvVars = getMissingMidtransEnvVars();

    if (missingEnvVars.length > 0) {
      return res.status(500).json({
        message: "Midtrans configuration is incomplete.",
        error: `Missing environment variables: ${missingEnvVars.join(", ")}`,
      });
    }

    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        message: "orderId is required.",
      });
    }

    const midtransStatusUrl = `${midtransConfig.apiBaseUrl}/v2/${orderId}/status`;

    const statusResponse = await sendMidtransRequest(midtransStatusUrl, "GET");
    const paymentData = buildMidtransPaymentUpdate({
      orderId,
      transactionStatus: statusResponse.transaction_status || null,
      paymentType: statusResponse.payment_type || null,
      transactionId: statusResponse.transaction_id || null,
      fraudStatus: statusResponse.fraud_status || null,
      payloadField: "statusPayload",
      payload: statusResponse,
      source: "midtrans_status_api",
    });

    await upsertPaymentStatus(orderId, paymentData);

    return res.status(200).json({
      message: "Midtrans status fetched successfully.",
      data: {
        ...statusResponse,
        persistedStatus: paymentData.status,
        diagnostics: createMidtransContext({ orderId }),
      },
    });
  } catch (error) {
    console.error("[midtrans] failed to fetch status", createMidtransContext({
      orderId: req.params?.orderId || null,
      statusCode: error.statusCode || null,
      midtransMessage: error.message,
      midtransResponse: error.responseBody || null,
      url: error.url || null,
    }));

    return res.status(500).json({
      message: "Failed to fetch Midtrans status.",
      error: error.message,
      diagnostics: createMidtransContext({
        orderId: req.params?.orderId || null,
        url: error.url || null,
      }),
    });
  }
});

router.get("/midtrans/local/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        message: "orderId is required.",
      });
    }

    const paymentSnapshot = await getDoc(doc(paymentsCollection, orderId));

    if (!paymentSnapshot.exists()) {
      return res.status(404).json({
        message: "Payment not found in local store.",
        diagnostics: createMidtransContext({ orderId }),
      });
    }

    return res.status(200).json({
      message: "Local payment fetched successfully.",
      data: {
        ...serializePayment(paymentSnapshot.data()),
        diagnostics: createMidtransContext({ orderId }),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch local payment.",
      error: error.message,
      diagnostics: createMidtransContext({
        orderId: req.params?.orderId || null,
      }),
    });
  }
});

router.get("/history", async (req, res) => {
  try {
    const resultLimit = normalizeLimit(req.query.limit, 20, 50);
    const userId = req.query.userId ? String(req.query.userId) : null;
    const email = req.query.email ? String(req.query.email).trim().toLowerCase() : null;
    let paymentQuery = null;

    if (userId) {
      paymentQuery = query(paymentsCollection, where("userId", "==", userId));
    } else if (email) {
      paymentQuery = query(paymentsCollection, where("userEmail", "==", email));
    }

    if (!paymentQuery) {
      return res.status(400).json({
        message: "userId or email query parameter is required to fetch payment history.",
      });
    }

    const paymentSnapshot = await getDocs(paymentQuery);

    const payments = sortPaymentsByNewest(
      paymentSnapshot.docs.map((snapshot) => serializePayment(snapshot.data()))
    ).slice(0, resultLimit);

    return res.status(200).json({
      message: "Payment history fetched successfully.",
      data: payments,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch payment history.",
      error: error.message,
    });
  }
});

router.get("/admin/history", async (req, res) => {
  try {
    const resultLimit = normalizeLimit(req.query.limit, 50, 100);
    const userId = req.query.userId ? String(req.query.userId) : null;
    const email = req.query.email ? String(req.query.email).trim().toLowerCase() : null;
    const status = req.query.status ? String(req.query.status) : null;
    let paymentQuery = null;

    if (userId && status) {
      paymentQuery = query(
        paymentsCollection,
        where("userId", "==", String(userId)),
        where("status", "==", String(status))
      );
    } else if (email && status) {
      paymentQuery = query(
        paymentsCollection,
        where("userEmail", "==", email),
        where("status", "==", status)
      );
    } else if (userId) {
      paymentQuery = query(paymentsCollection, where("userId", "==", userId));
    } else if (email) {
      paymentQuery = query(paymentsCollection, where("userEmail", "==", email));
    } else if (status) {
      paymentQuery = query(paymentsCollection, where("status", "==", status));
    } else {
      paymentQuery = query(paymentsCollection);
    }

    const paymentSnapshot = await getDocs(paymentQuery);
    const payments = sortPaymentsByNewest(
      paymentSnapshot.docs.map((snapshot) => serializePayment(snapshot.data()))
    ).slice(0, resultLimit);

    return res.status(200).json({
      message: "Admin payment history fetched successfully.",
      data: payments,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch admin payment history.",
      error: error.message,
    });
  }
});

module.exports = router;
