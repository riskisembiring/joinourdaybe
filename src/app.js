const express = require("express");
const authRoutes = require("./routes/auth");
const paymentRoutes = require("./routes/payments");
const testimonialRoutes = require("./routes/testimonials");

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.status(200).json({
    message: "API is running.",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/testimonials", testimonialRoutes);

app.use((err, _req, res, _next) => {
  res.status(500).json({
    message: "Internal server error.",
    error: err.message,
  });
});

module.exports = app;
