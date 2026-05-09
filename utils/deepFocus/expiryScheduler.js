import { findExpiredActiveSessions } from "../../models/deepFocus/sessions.js";
import { endDeepFocusSession } from "./endSession.js";

// In-memory timer store keyed by sessionId; mirrors pomodoroScheduler pattern.
const expiryTimers = new Map();

// setTimeout uses a 32-bit signed int for delay in ms; larger values trigger
// immediate firing. Cap at max and rely on the periodic sweep as a backstop.
const MAX_TIMEOUT_MS = 2147483647;

export function scheduleExpiry(sessionId, expiresAt, client) {
  const existing = expiryTimers.get(sessionId);
  if (existing) {
    clearTimeout(existing);
    expiryTimers.delete(sessionId);
  }

  const delay = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const safeDelay = Math.min(delay, MAX_TIMEOUT_MS);

  const timeoutId = setTimeout(async () => {
    expiryTimers.delete(sessionId);
    try {
      await endDeepFocusSession({ sessionId, endReason: "expired", client });
    } catch (error) {
      console.error(`❌ Deep focus expiry failed for session ${sessionId}:`, error);
    }
  }, safeDelay);

  expiryTimers.set(sessionId, timeoutId);
  console.log(`⏳ Scheduled deep focus expiry for session ${sessionId} in ${safeDelay}ms`);
}

export function cancelExpiry(sessionId) {
  const timer = expiryTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    expiryTimers.delete(sessionId);
    console.log(`🧹 Cancelled deep focus expiry for session ${sessionId}`);
  }
}

export function startPeriodicSweep(client) {
  setInterval(async () => {
    try {
      const expired = await findExpiredActiveSessions();
      if (!expired || expired.length === 0) return;
      console.log(`🧹 Deep focus sweep found ${expired.length} expired session(s)`);
      for (const session of expired) {
        try {
          await endDeepFocusSession({ sessionId: session.id, endReason: "expired", client });
        } catch (error) {
          console.error(`❌ Deep focus sweep failed for session ${session.id}:`, error);
        }
      }
    } catch (error) {
      console.error("❌ Deep focus periodic sweep error:", error);
    }
  }, 60_000);
  console.log("🔁 Deep focus periodic sweep started (60s interval)");
}
