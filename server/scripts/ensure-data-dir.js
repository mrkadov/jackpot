const fs = require("fs");
const path = require("path");
require("dotenv").config();

const url = process.env.DATABASE_URL || "file:./dev.db";
if (url.startsWith("file:")) {
  const filePath = path.resolve(url.slice("file:".length));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
