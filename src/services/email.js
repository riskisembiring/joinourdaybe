const https = require("https");

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function sendJsonRequest(urlString, method, headers, payload) {
  const url = new URL(urlString);
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
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

          return reject(
            new Error(
              parsedBody.message ||
                parsedBody.error?.message ||
                parsedBody.error ||
                `Email provider request failed with status ${response.statusCode}.`
            )
          );
        });
      }
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function sendViaResend({ to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM are required for email notifications.");
  }

  return sendJsonRequest(
    "https://api.resend.com/emails",
    "POST",
    {
      Authorization: `Bearer ${apiKey}`,
    },
    {
      from,
      to,
      subject,
      text,
    }
  );
}

async function sendAdminEmail({ subject, text }) {
  const adminEmails = getAdminEmails();

  if (adminEmails.length === 0) {
    return {
      skipped: true,
      reason: "ADMIN_EMAILS is empty.",
    };
  }

  const provider = (process.env.EMAIL_NOTIFICATION_PROVIDER || "resend").trim().toLowerCase();

  if (provider === "resend") {
    await sendViaResend({
      to: adminEmails,
      subject,
      text,
    });

    return {
      skipped: false,
      provider,
      recipients: adminEmails,
    };
  }

  throw new Error(`Unsupported email provider: ${provider}`);
}

module.exports = {
  getAdminEmails,
  sendAdminEmail,
};
