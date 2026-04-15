const { serverTimestamp } = require("firebase/firestore");
const { sendAdminEmail } = require("./email");
const { sendAdminWhatsApp } = require("./whatsapp");

function getPackageName(payment = {}) {
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

function formatCurrency(amount) {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return "-";
  }

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPaymentSummary(payment = {}) {
  return {
    orderId: payment.orderId || payment.id || "-",
    nama:
      payment.userName ||
      payment.customerDetails?.first_name ||
      payment.metadata?.nama ||
      "-",
    email: payment.userEmail || payment.customerDetails?.email || payment.metadata?.email || "-",
    paket: getPackageName(payment) || "-",
    amount: formatCurrency(payment.amount),
    paymentType: payment.paymentType || "-",
    transactionId: payment.transactionId || "-",
    status: payment.status || "-",
  };
}

function buildNotificationContent(payment) {
  const summary = formatPaymentSummary(payment);
  const subject = `Pembayaran sukses: ${summary.orderId}`;
  const lines = [
    "Pembayaran berhasil settlement.",
    "",
    `Order ID: ${summary.orderId}`,
    `Nama: ${summary.nama}`,
    `Email: ${summary.email}`,
    `Paket: ${summary.paket}`,
    `Nominal: ${summary.amount}`,
    `Metode: ${summary.paymentType}`,
    `Transaction ID: ${summary.transactionId}`,
    `Status: ${summary.status}`,
  ];

  return {
    subject,
    message: lines.join("\n"),
  };
}

function getSettlementNotificationState(payment = {}) {
  return payment.adminNotifications?.settlement || {};
}

async function notifyAdminOnSettlement(payment = {}) {
  const state = getSettlementNotificationState(payment);
  const { subject, message } = buildNotificationContent(payment);
  const updates = {
    "adminNotifications.settlement.lastAttemptAt": serverTimestamp(),
  };
  const results = {};

  if (!state.emailSentAt) {
    try {
      const emailResult = await sendAdminEmail({ subject, text: message });
      results.email = emailResult;

      if (!emailResult.skipped) {
        updates["adminNotifications.settlement.emailSentAt"] = serverTimestamp();
        updates["adminNotifications.settlement.emailError"] = null;
      }
    } catch (error) {
      results.email = {
        skipped: false,
        error: error.message,
      };
      updates["adminNotifications.settlement.emailError"] = error.message;
    }
  } else {
    results.email = {
      skipped: true,
      reason: "Email notification already sent.",
    };
  }

  if (!state.whatsappSentAt) {
    try {
      const whatsappResult = await sendAdminWhatsApp({ message });
      results.whatsapp = whatsappResult;

      if (!whatsappResult.skipped) {
        updates["adminNotifications.settlement.whatsappSentAt"] = serverTimestamp();
        updates["adminNotifications.settlement.whatsappError"] = null;
      }
    } catch (error) {
      results.whatsapp = {
        skipped: false,
        error: error.message,
      };
      updates["adminNotifications.settlement.whatsappError"] = error.message;
    }
  } else {
    results.whatsapp = {
      skipped: true,
      reason: "WhatsApp notification already sent.",
    };
  }

  return {
    updates,
    results,
  };
}

module.exports = {
  notifyAdminOnSettlement,
};
