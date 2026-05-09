const NICK_MAX = 32;
const DF_PREFIX_RE = /^\[DF [^\]]*\]\s*/;

function formatPrefix(expiresAt) {
  const hh = String(expiresAt.getUTCHours()).padStart(2, '0');
  const mm = String(expiresAt.getUTCMinutes()).padStart(2, '0');
  return `[DF until ${hh}:${mm}] `;
}

function stripExistingPrefix(name) {
  return name.replace(DF_PREFIX_RE, '');
}

export async function applyBadge(member, expiresAt) {
  if (!member) {
    return { applied: false, originalNickname: null };
  }

  const originalNickname = member.nickname ?? null;
  const baseName = stripExistingPrefix(member.nickname ?? member.user?.username ?? '');
  const prefix = formatPrefix(expiresAt);

  const room = NICK_MAX - prefix.length;
  const truncated = room > 0 ? baseName.slice(0, room) : '';
  const newNick = `${prefix}${truncated}`.slice(0, NICK_MAX);

  try {
    await member.setNickname(newNick, 'Deep Focus badge applied');
    console.log(`✅ applyBadge: set nickname for ${member.id} → "${newNick}"`);
    return { applied: true, originalNickname };
  } catch (err) {
    console.warn(`⚠️ applyBadge: failed for ${member.id} — ${err?.code ?? ''} ${err?.message ?? err}`);
    return { applied: false, originalNickname: null };
  }
}

export async function removeBadge(member, originalNickname) {
  if (!member) {
    return { restored: false };
  }

  try {
    if (originalNickname !== undefined) {
      await member.setNickname(originalNickname ?? null, 'Deep Focus badge removed');
      console.log(`✅ removeBadge: restored nickname for ${member.id}`);
      return { restored: true };
    }

    const current = member.nickname ?? '';
    const stripped = stripExistingPrefix(current);
    const next = stripped.length > 0 ? stripped : null;
    await member.setNickname(next, 'Deep Focus badge removed');
    console.log(`✅ removeBadge: stripped DF prefix for ${member.id}`);
    return { restored: true };
  } catch (err) {
    console.warn(`⚠️ removeBadge: failed for ${member.id} — ${err?.code ?? ''} ${err?.message ?? err}`);
    return { restored: false };
  }
}
