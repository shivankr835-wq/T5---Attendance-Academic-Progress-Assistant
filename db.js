import Database from "better-sqlite3";
import fs from "node:fs";

const db = new Database("campusbuddy.db");

db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync("schema.sql", "utf8"));

export default db;