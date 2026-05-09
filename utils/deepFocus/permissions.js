async function resolveChannel(guild, id) {
  const cached = guild.channels.cache.get(id);
  if (cached) return cached;
  try {
    return await guild.channels.fetch(id);
  } catch {
    return null;
  }
}

export async function applyRoleHides(guild, roleId, { categoryIds = [], channelIds = [] } = {}) {
  const applied = [];
  const failed = [];
  const ids = [...categoryIds, ...channelIds];

  for (const id of ids) {
    const channel = await resolveChannel(guild, id);
    if (!channel) {
      console.warn(`⚠️ applyRoleHides: channel ${id} not found, skipping`);
      failed.push(id);
      continue;
    }
    try {
      await channel.permissionOverwrites.edit(
        roleId,
        { ViewChannel: false },
        { reason: 'Deep Focus setup' }
      );
      applied.push(id);
    } catch (err) {
      console.warn(`⚠️ applyRoleHides: failed on ${id} — ${err?.message ?? err}`);
      failed.push(id);
    }
  }

  console.log(`✅ applyRoleHides: applied=${applied.length} failed=${failed.length} role=${roleId}`);
  return { applied, failed };
}

export async function removeRoleHides(guild, roleId, { categoryIds = [], channelIds = [] } = {}) {
  const removed = [];
  const failed = [];
  const ids = [...categoryIds, ...channelIds];

  for (const id of ids) {
    const channel = await resolveChannel(guild, id);
    if (!channel) {
      console.warn(`⚠️ removeRoleHides: channel ${id} not found, skipping`);
      failed.push(id);
      continue;
    }
    try {
      await channel.permissionOverwrites.delete(roleId, 'Deep Focus teardown');
      removed.push(id);
    } catch (err) {
      console.warn(`⚠️ removeRoleHides: failed on ${id} — ${err?.message ?? err}`);
      failed.push(id);
    }
  }

  console.log(`✅ removeRoleHides: removed=${removed.length} failed=${failed.length} role=${roleId}`);
  return { removed, failed };
}

export async function applyUserExceptions(guild, userId, channelIds = []) {
  const applied = [];
  const failed = [];

  for (const id of channelIds) {
    const channel = await resolveChannel(guild, id);
    if (!channel) {
      console.warn(`⚠️ applyUserExceptions: channel ${id} not found, skipping`);
      failed.push(id);
      continue;
    }
    try {
      await channel.permissionOverwrites.edit(
        userId,
        { ViewChannel: true },
        { reason: 'Deep Focus user exception' }
      );
      applied.push(id);
    } catch (err) {
      console.warn(`⚠️ applyUserExceptions: failed on ${id} — ${err?.message ?? err}`);
      failed.push(id);
    }
  }

  console.log(`✅ applyUserExceptions: applied=${applied.length} failed=${failed.length} user=${userId}`);
  return { applied, failed };
}

export async function removeUserExceptions(guild, userId, channelIds = []) {
  const removed = [];
  const failed = [];

  for (const id of channelIds) {
    const channel = await resolveChannel(guild, id);
    if (!channel) {
      console.warn(`⚠️ removeUserExceptions: channel ${id} not found, skipping`);
      failed.push(id);
      continue;
    }
    try {
      await channel.permissionOverwrites.delete(userId, 'Deep Focus teardown');
      removed.push(id);
    } catch (err) {
      console.warn(`⚠️ removeUserExceptions: failed on ${id} — ${err?.message ?? err}`);
      failed.push(id);
    }
  }

  console.log(`✅ removeUserExceptions: removed=${removed.length} failed=${failed.length} user=${userId}`);
  return { removed, failed };
}
