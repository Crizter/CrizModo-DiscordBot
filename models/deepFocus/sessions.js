import { pool } from "../../database/mysql.js";

function parseJsonColumn(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hydrateSession(row) {
  if (!row) return null;
  return {
    ...row,
    exemption_channel_ids: parseJsonColumn(row.exemption_channel_ids),
    badge_enabled: !!row.badge_enabled,
  };
}

export async function createSession({
  guildId,
  userId,
  startedAt,
  expiresAt,
  exemptionChannelIds = [],
  badgeEnabled = false,
  originalNickname = null,
}) {
  const [result] = await pool.query(
    `INSERT INTO deep_focus_sessions
      (guild_id, user_id, started_at, expires_at, exemption_channel_ids, badge_enabled, original_nickname)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      guildId,
      userId,
      startedAt,
      expiresAt,
      JSON.stringify(exemptionChannelIds ?? []),
      badgeEnabled ? 1 : 0,
      originalNickname,
    ]
  );
  return { id: result.insertId };
}

export async function getActiveSession(guildId, userId) {
  const [rows] = await pool.query(
    `SELECT * FROM deep_focus_sessions
     WHERE guild_id = ? AND user_id = ? AND ended_at IS NULL
     ORDER BY started_at DESC LIMIT 1`,
    [guildId, userId]
  );
  return rows.length ? hydrateSession(rows[0]) : null;
}

export async function getAllActiveSessions() {
  const [rows] = await pool.query(
    "SELECT * FROM deep_focus_sessions WHERE ended_at IS NULL"
  );
  return rows.map(hydrateSession);
}

export async function getSessionById(id) {
  const [rows] = await pool.query(
    "SELECT * FROM deep_focus_sessions WHERE id = ? LIMIT 1",
    [id]
  );
  return rows.length ? hydrateSession(rows[0]) : null;
}

export async function endSession(sessionId, endReason) {
  await pool.query(
    "UPDATE deep_focus_sessions SET ended_at = NOW(), end_reason = ? WHERE id = ?",
    [endReason, sessionId]
  );
}

export async function findExpiredActiveSessions() {
  const [rows] = await pool.query(
    "SELECT * FROM deep_focus_sessions WHERE expires_at < NOW() AND ended_at IS NULL"
  );
  return rows.map(hydrateSession);
}
