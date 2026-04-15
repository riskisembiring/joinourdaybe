const https = require("https");

function getAdminWhatsAppNumbers() {
  return (process.env.WHATSAPP_ADMIN_NUMBERS || process.env.ADMIN_WHATSAPP_NUMBERS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isWhatsAppAdminNotificationEnabled() {
  return String(process.env.WHATSAPP_ADMIN_ENABLED || "false").toLowerCase() === "true";
}

function getWhatsAppConfig() {
  return {
    enabled: isWhatsAppAdminNotificationEnabled(),
    provider: (process.env.WHATSAPP_PROVIDER || "fonnte").toLowerCase(),
    adminNumbers: getAdminWhatsAppNumbers(),
    fonnteToken: process.env.FONNTE_TOKEN || null,
  };
}

function sendJsonRequest(urlString, payload, headers = {}) {
  const url = new URL(urlString);
  const requestBody = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
          ...headers,
        },
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

          const error = new Error(parsedBody.reason || parsedBody.message || "WhatsApp request failed.");
          error.statusCode = response.statusCode;
          error.responseBody = parsedBody;
          return reject(error);
        });
      }
    );

    request.on("error", reject);
    request.write(requestBody);
    request.end();
  });
}

async function sendAdminSettlementWhatsApp(message) {
  const config = getWhatsAppConfig();

  if (!config.enabled) {
    return {
      skipped: true,
      reason: "disabled",
    };
  }

  if (config.adminNumbers.length === 0) {
    return {
      skipped: true,
      reason: "missing_admin_numbers",
    };
  }

  if (config.provider !== "fonnte") {
    return {
      skipped: true,
      reason: "unsupported_provider",
      provider: config.provider,
    };
  }

  if (!config.fonnteToken) {
    return {
      skipped: true,
      reason: "missing_fonnte_token",
    };
  }

  const response = await sendJsonRequest(
    "https://api.fonnte.com/send",
    {
      target: config.adminNumbers.join(","),
      message,
      countryCode: "62",
    },
    {
      Authorization: config.fonnteToken,
    }
  );

  return {
    skipped: false,
    provider: config.provider,
    recipients: config.adminNumbers,
    response,
  };
}

module.exports = {
  getWhatsAppConfig,
  sendAdminSettlementWhatsApp,
};
