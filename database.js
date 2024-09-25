// database.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Create or connect to the database (will create the database.sqlite file if it doesn't exist)
const dbPath = path.resolve(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    return console.error("Error opening database:", err.message);
  }
  console.log("Connected to SQLite3 database.");
});

module.exports = db;
