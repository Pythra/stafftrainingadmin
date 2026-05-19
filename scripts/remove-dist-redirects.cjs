const fs = require("fs");
const path = require("path");

const redirectsPath = path.join(__dirname, "..", "dist", "_redirects");
if (fs.existsSync(redirectsPath)) {
  fs.unlinkSync(redirectsPath);
  console.log("Removed dist/_redirects (conflicts with Workers SPA routing)");
}
