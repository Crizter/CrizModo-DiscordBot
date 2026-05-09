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

function hydrateConfig(row) {
  if (!row) return null;
  return {
    ...row,
    hidden_category_ids: parseJsonColumn(row.hidden_category_ids),
    hidden_channel_ids: parseJsonColumn(row.hidden_channel_ids),
    whitelist_channel_ids: parseJsonColumn(row.whitelist_channel_ids),
    always_visible_channel_ids: parseJsonColumn(row.always_visible_channel_ids),
  };
}

export async function getConfig(guildId) {
  const [rows] = await pool.query(
    "SELECT * FROM deep_focus_configs WHERE guild_id = ? LIMIT 1",
    [guildId]
  );
  return rows.length ? hydrateConfig(rows[0]) : null;
}

export async function upsertConfig({
  guildId,
  roleId,
  setupChannelId = null,
  setupMessageId = null,
  hiddenCategoryIds = [],
  hiddenChannelIds = [],
  whitelistChannelIds = [],
  alwaysVisibleChannelIds = [],
  maxDurationMinutes = 600,
}) {
  const sql = `
    INSERT INTO deep_focus_configs
      (guild_id, role_id, setup_channel_id, setup_message_id,
       hidden_category_ids, hidden_channel_ids, whitelist_channel_ids,
       always_visible_channel_ids, max_duration_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      role_id = VALUES(role_id),
      setup_channel_id = VALUES(setup_channel_id),
      setup_message_id = VALUES(setup_message_id),
      hidden_category_ids = VALUES(hidden_category_ids),
      hidden_channel_ids = VALUES(hidden_channel_ids),
      whitelist_channel_ids = VALUES(whitelist_channel_ids),
      always_visible_channel_ids = VALUES(always_visible_channel_ids),
      max_duration_minutes = VALUES(max_duration_minutes)
  `;
  await pool.query(sql, [
    guildId,
    roleId,
    setupChannelId,
    setupMessageId,
    JSON.stringify(hiddenCategoryIds ?? []),
    JSON.stringify(hiddenChannelIds ?? []),
    JSON.stringify(whitelistChannelIds ?? []),
    JSON.stringify(alwaysVisibleChannelIds ?? []),
    maxDurationMinutes,
  ]);
}

export async function setSetupMessage(guildId, messageId) {
  await pool.query(
    "UPDATE deep_focus_configs SET setup_message_id = ? WHERE guild_id = ?",
    [messageId, guildId]
  );
}

export async function deleteConfig(guildId) {
  await pool.query("DELETE FROM deep_focus_configs WHERE guild_id = ?", [
    guildId,
  ]);
}
