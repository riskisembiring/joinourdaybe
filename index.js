require("dotenv").config();

if (!process.env.JWT_SECRET) {
  throw new Error("Missing environment variable: JWT_SECRET");
}

const app = require("./src/app");

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
