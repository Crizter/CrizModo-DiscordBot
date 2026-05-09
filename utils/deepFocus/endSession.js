import { getConfig } from "../../models/deepFocus/configs.js";
import {
  getSessionById,
  endSession as endSessionRecord,
} from "../../models/deepFocus/sessions.js";
import {
  getUnrevertedOverrides,
  markOverrideReverted,
} from "../../models/deepFocus/overrides.js";
import { removeUserExceptions } from "./permissions.js";
import { removeBadge } from "./nicknameBadge.js";
import { cancelExpiry } from "./expiryScheduler.js";

export async function endDeepFocusSession({ sessionId, endReason, client }) {
  let session = null;
  try {
    session = await getSessionById(sessionId);
  } catch (error) {
    console.error(`❌ Deep focus: failed loading session ${sessionId}:`, error);
    return { ok: false };
  }
  if (!session || session.ended_at) {
    return { ok: true };
  }

  let guild = null;
  try {
    guild = await client.guilds.fetch(session.guild_id);
  } catch (error) {
    console.warn(`⚠️ Deep focus: guild ${session.guild_id} unavailable, stamping error end for session ${sessionId}`);
    try {
      await endSessionRecord(sessionId, "error");
    } catch (stampError) {
      console.error(`❌ Deep focus: failed stamping error end for session ${sessionId}:`, stampError);
    }
    cancelExpiry(sessionId);
    return { ok: false };
  }

  let member = null;
  try {
    member = await guild.members.fetch(session.user_id);
  } catch {
    console.warn(`⚠️ Deep focus: member ${session.user_id} not in guild ${session.guild_id}; skipping Discord ops`);
  }

  let config = null;
  try {
    config = await getConfig(session.guild_id);
  } catch (error) {
    console.error(`❌ Deep focus: failed loading config for guild ${session.guild_id}:`, error);
  }

  if (member && config?.roleId) {
    try {
      await member.roles.remove(config.roleId, "Deep Focus ended");
    } catch (error) {
      console.error(`❌ Deep focus: failed removing role for ${session.user_id}:`, error);
    }
  }

  try {
    const overrides = await getUnrevertedOverrides(sessionId);
    for (const override of overrides) {
      try {
        if (member) {
          await removeUserExceptions(guild, session.user_id, [override.channel_id]);
        }
        await markOverrideReverted(override.id);
      } catch (error) {
        console.error(`❌ Deep focus: failed reverting override ${override.id}:`, error);
      }
    }
  } catch (error) {
    console.error(`❌ Deep focus: failed loading overrides for session ${sessionId}:`, error);
  }

  if (member && session.badge_enabled) {
    try {
      await removeBadge(member, session.original_nickname);
    } catch (error) {
      console.error(`❌ Deep focus: failed removing badge for ${session.user_id}:`, error);
    }
  }

  try {
    await endSessionRecord(sessionId, endReason);
  } catch (error) {
    console.error(`❌ Deep focus: failed stamping end for session ${sessionId}:`, error);
  }

  cancelExpiry(sessionId);

  if (member) {
    try {
      const user = await client.users.fetch(session.user_id);
      await user.send("🧘 Deep focus complete! Welcome back.");
    } catch {
      // DMs disabled; best-effort.
    }
  }

  console.log(`🧘 Deep focus session ${sessionId} ended (${endReason})`);
  return { ok: true };
}
