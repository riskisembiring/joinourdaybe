const jwt = require("jsonwebtoken");

function getBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.split(" ")[1];
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function createAccessToken(user = {}) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email || null,
      nama: user.nama || null,
      role: user.role || "user",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );
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
