import mysql from "mysql2/promise";
import "dotenv/config";

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: "Z",
  dateStrings: false,
});

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS deep_focus_configs (
    guild_id VARCHAR(32) PRIMARY KEY,
    role_id VARCHAR(32) NOT NULL,
    setup_channel_id VARCHAR(32),
    setup_message_id VARCHAR(32),
    hidden_category_ids JSON,
    hidden_channel_ids JSON,
    whitelist_channel_ids JSON,
    always_visible_channel_ids JSON,
    max_duration_minutes INT NOT NULL DEFAULT 600,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS deep_focus_sessions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    started_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    ended_at DATETIME NULL,
    end_reason ENUM('expired','manual','admin','error') NULL,
    exemption_channel_ids JSON,
    badge_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    original_nickname VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_guild_user_ended (guild_id, user_id, ended_at),
    INDEX idx_expires_ended (expires_at, ended_at)
  )`,
  `CREATE TABLE IF NOT EXISTS deep_focus_overrides (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id BIGINT NOT NULL,
    channel_id VARCHAR(32) NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reverted_at DATETIME NULL,
    INDEX idx_session (session_id)
  )`,
];

export async function initMysqlSchema() {
  try {
    for (const stmt of SCHEMA_STATEMENTS) {
      await pool.query(stmt);
    }
    console.log("💾 ✅ MySQL schema initialized (deep_focus_*)");
  } catch (error) {
    console.error("❌ MySQL schema init failed!", error);
    throw error;
  }
}

export async function testMysqlConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log("✅ Successfully connected to MySQL!");
  } catch (error) {
    console.error("❌ Connection to MySQL failed!", error);
    throw error;
  }
}
