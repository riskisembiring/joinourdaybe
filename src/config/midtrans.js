const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
const environment = isProduction ? "production" : "sandbox";

const midtransConfig = {
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY || "",
  isProduction,
  environment,
  snapBaseUrl: isProduction
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions",
  apiBaseUrl: isProduction ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com",
};

function getMissingMidtransEnvVars() {
  return ["MIDTRANS_SERVER_KEY"].filter((key) => !process.env[key]);
}

function maskMidtransKey(value) {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}***`;
  }

  return `${value.slice(0, 6)}***${value.slice(-4)}`;
}

function getMidtransDiagnostics() {
  return {
    environment,
    isProduction,
    snapBaseUrl: midtransConfig.snapBaseUrl,
    apiBaseUrl: midtransConfig.apiBaseUrl,
    serverKeyMasked: maskMidtransKey(midtransConfig.serverKey),
    clientKeyMasked: maskMidtransKey(midtransConfig.clientKey),
  };
}

module.exports = { midtransConfig, getMissingMidtransEnvVars, getMidtransDiagnostics };
