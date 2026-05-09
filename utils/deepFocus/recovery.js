import { getAllActiveSessions } from "../../models/deepFocus/sessions.js";
import {
  getOrphanedOverrides,
  markOverrideReverted,
} from "../../models/deepFocus/overrides.js";
import { getSessionById } from "../../models/deepFocus/sessions.js";
import { removeUserExceptions } from "./permissions.js";
import { endDeepFocusSession } from "./endSession.js";
import { scheduleExpiry } from "./expiryScheduler.js";

export async function recoverDeepFocusSessions(client) {
  let recovered = 0;
  let expired = 0;
  let orphansCleaned = 0;

  try {
    const sessions = await getAllActiveSessions();
    const now = Date.now();
    for (const session of sessions) {
      try {
        if (new Date(session.expires_at).getTime() < now) {
          await endDeepFocusSession({ sessionId: session.id, endReason: "expired", client });
          expired += 1;
        } else {
          scheduleExpiry(session.id, new Date(session.expires_at), client);
          recovered += 1;
        }
      } catch (error) {
        console.error(`❌ Deep focus recovery failed for session ${session.id}:`, error);
      }
    }
  } catch (error) {
    console.error("❌ Deep focus recovery: failed loading active sessions:", error);
  }

  try {
    const orphans = await getOrphanedOverrides();
    for (const override of orphans) {
      try {
        const session = await getSessionById(override.session_id ?? override.sessionId);
        if (session) {
          const guild = await client.guilds.fetch(session.guild_id).catch(() => null);
          if (guild) {
            await removeUserExceptions(guild, session.user_id, [override.channel_id]).catch(() => {});
          }
        }
        await markOverrideReverted(override.id);
        orphansCleaned += 1;
      } catch (error) {
        console.error(`❌ Deep focus recovery: failed cleaning orphan override ${override.id}:`, error);
      }
    }
  } catch (error) {
    console.error("❌ Deep focus recovery: failed loading orphan overrides:", error);
  }

  console.log(`♻️ Recovered ${recovered} active deep focus sessions, expired ${expired}, cleaned ${orphansCleaned} orphan overrides.`);
}
