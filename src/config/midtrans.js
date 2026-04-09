const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";

const midtransConfig = {
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY || "",
  isProduction,
  snapBaseUrl: isProduction
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions",
};

function getMissingMidtransEnvVars() {
  return ["MIDTRANS_SERVER_KEY"].filter((key) => !process.env[key]);
}

module.exports = { midtransConfig, getMissingMidtransEnvVars };
