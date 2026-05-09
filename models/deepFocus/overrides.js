import { pool } from "../../database/mysql.js";

export async function recordOverride({ sessionId, channelId }) {
  const [result] = await pool.query(
    "INSERT INTO deep_focus_overrides (session_id, channel_id) VALUES (?, ?)",
    [sessionId, channelId]
  );
  return { id: result.insertId };
}

export async function getUnrevertedOverrides(sessionId) {
  const [rows] = await pool.query(
    "SELECT * FROM deep_focus_overrides WHERE session_id = ? AND reverted_at IS NULL",
    [sessionId]
  );
  return rows;
}

export async function markOverrideReverted(overrideId) {
  await pool.query(
    "UPDATE deep_focus_overrides SET reverted_at = NOW() WHERE id = ?",
    [overrideId]
  );
}

export async function getOrphanedOverrides() {
  const [rows] = await pool.query(
    `SELECT o.*
     FROM deep_focus_overrides o
     INNER JOIN deep_focus_sessions s ON s.id = o.session_id
     WHERE o.reverted_at IS NULL AND s.ended_at IS NOT NULL`
  );
  return rows;
}
