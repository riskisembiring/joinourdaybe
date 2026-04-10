const jwt = require("jsonwebtoken");

function getJwtSecret() {
  return process.env.JWT_SECRET || null;
}

function getBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.split(" ")[1];
}

function encodeUnsignedToken(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeUnsignedToken(token) {
  const decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));

  if (!decoded || typeof decoded !== "object") {
    throw new Error("Invalid token payload.");
  }

  if (decoded.exp && Date.now() >= decoded.exp) {
    throw new Error("Token expired.");
  }

  return decoded;
}

function verifyAccessToken(token) {
  const secret = getJwtSecret();

  if (secret) {
    return jwt.verify(token, secret);
  }

  return decodeUnsignedToken(token);
}

function createAccessToken(user = {}) {
  const payload = {
    id: user.id,
    email: user.email || null,
    nama: user.nama || null,
    role: user.role || "user",
  };
  const secret = getJwtSecret();

  if (secret) {
    return jwt.sign(payload, secret, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });
  }

  return encodeUnsignedToken({
    ...payload,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
}

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminUser(user = {}) {
  if (user.role === "admin" || user.isAdmin === true) {
    return true;
  }

  const adminEmails = getAdminEmails();
  return Boolean(user.email) && adminEmails.includes(String(user.email).toLowerCase());
}

function requireAuth(req, res, next) {
  const token = getBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({
      message: "Unauthorized. Bearer token is required.",
    });
  }

  try {
    req.user = verifyAccessToken(token);
    return next();
  } catch (error) {
    return res.status(401).json({
      message: "Unauthorized. Invalid or expired token.",
    });
  }
}

function attachAuthUser(req, _res, next) {
  const token = getBearerToken(req.headers.authorization);

  if (!token) {
    return next();
  }

  try {
    req.user = verifyAccessToken(token);
  } catch (_error) {
    req.user = null;
  }

  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      message: "Unauthorized. Admin access requires a valid token.",
    });
  }

  if (!isAdminUser(req.user)) {
    return res.status(403).json({
      message: "Forbidden. Admin access only.",
    });
  }

  return next();
}

module.exports = {
  attachAuthUser,
  createAccessToken,
  getAdminEmails,
  isAdminUser,
  requireAdmin,
  requireAuth,
  verifyAccessToken,
};
