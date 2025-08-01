import { PermissionFlagsBits } from "discord.js";
import { RoomActiveCheck } from "../models/RoomActiveCheck.js";

// Cache for frequently accessed configs (optional optimization)
const configCache = new Map();

export async function setGuildConfig(guildId, config) {
  try {
    // Update or create the configuration in database
    const updatedConfig = await RoomActiveCheck.findOneAndUpdate(
      { guildId },
      { 
        guildId,
        enabled: config.enabled,
        primaryChannelId: config.primaryChannelId,
        secondaryChannelId: config.secondaryChannelId,
        requiredRoleId: config.requiredRoleId,
        threshold: config.threshold,
        updatedAt: new Date()
      },
      { 
        upsert: true, // Create if doesn't exist
        new: true     // Return updated document
      }
    );

    // Update cache
    configCache.set(guildId, updatedConfig.toObject());
    
    console.log(`💾 Guild config saved to database for guild: ${guildId}`);
    return updatedConfig;
  } catch (error) {
    console.error('❌ Error saving guild config to database:', error);
    throw error;
  }
}

export async function getGuildConfig(guildId) {
  try {
    // Check cache first
    if (configCache.has(guildId)) {
      return configCache.get(guildId);
    }

    // Fetch from database
    const config = await RoomActiveCheck.findOne({ guildId });
    
    if (config) {
      const configObj = config.toObject();
      configCache.set(guildId, configObj);
      return configObj;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error fetching guild config from database:', error);
    return null;
  }
}

export async function initializeGuildFeatureState(guildId) {
  try {
    // Check if guild config already exists
    const existingConfig = await RoomActiveCheck.findOne({ guildId });
    
    if (!existingConfig) {
      // Create default config
      const defaultConfig = new RoomActiveCheck({
        guildId,
        enabled: false
      });
      
      await defaultConfig.save();
      configCache.set(guildId, defaultConfig.toObject());
      console.log(`🆕 Created default room active check config for guild: ${guildId}`);
    } else {
      // Load existing config into cache
      configCache.set(guildId, existingConfig.toObject());
      console.log(`📖 Loaded existing room active check config for guild: ${guildId}`);
    }
  } catch (error) {
    console.error('❌ Error initializing guild feature state:', error);
  }
}

export async function removeGuildFeatureState(guildId) {
  try {
    // Remove from database
    await RoomActiveCheck.findOneAndDelete({ guildId });
    
    // Remove from cache
    configCache.delete(guildId);
    
    console.log(`🗑️ Removed room active check config for guild: ${guildId}`);
  } catch (error) {
    console.error('❌ Error removing guild feature state:', error);
  }
}

export async function getAllActiveGuilds() {
  try {
    const activeConfigs = await RoomActiveCheck.find({ enabled: true });
    return activeConfigs.map(config => config.toObject());
  } catch (error) {
    console.error('❌ Error fetching active guilds:', error);
    return [];
  }
}

// Legacy function - no longer needed but keeping for compatibility
export function loadConfig() {
  console.log('📝 Room active check now uses database storage');
  return null;
}

export async function manageChannelVisibility(guild, memberCount, config) {
  try {
    // Get the secondary voice channel
    const secondaryChannel = await guild.channels.fetch(config.secondaryChannelId);
    if (!secondaryChannel) {
      console.error('❌ Secondary voice channel not found');
      return;
    }

    // Get the required role
    const requiredRole = await guild.roles.fetch(config.requiredRoleId);
    if (!requiredRole) {
      console.error('❌ Required role not found');
      return;
    }

    // Count members in secondary channel
    const secondaryMemberCount = secondaryChannel.members.size;
    
    console.log(`📊 Channel status - Primary: ${memberCount} members, Secondary: ${secondaryMemberCount} members, Threshold: ${config.threshold}`);

    // Decision logic with edge case handling
    if (memberCount >= config.threshold) {
      // Primary channel meets threshold - make secondary visible to required role
      await secondaryChannel.permissionOverwrites.set([
        {
          id: guild.roles.everyone.id, // @everyone role
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: config.requiredRoleId, // Required role
          allow: [PermissionFlagsBits.ViewChannel]
        }
      ]);
      console.log(`✅ Secondary channel "${secondaryChannel.name}" made visible to role "${requiredRole.name}" (Primary: ${memberCount} >= ${config.threshold})`);
      
    } else if (secondaryMemberCount > 0) {
      // Primary channel below threshold BUT secondary channel has members - keep it visible
      await secondaryChannel.permissionOverwrites.set([
        {
          id: guild.roles.everyone.id, // @everyone role
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: config.requiredRoleId, // Required role
          allow: [PermissionFlagsBits.ViewChannel]
        }
      ]);
      console.log(`🔒 Secondary channel "${secondaryChannel.name}" kept visible to role "${requiredRole.name}" (Primary: ${memberCount} < ${config.threshold}, but Secondary has ${secondaryMemberCount} members)`);
      
    } else {
      // Primary channel below threshold AND secondary channel is empty - hide it
      await secondaryChannel.permissionOverwrites.set([
        {
          id: guild.roles.everyone.id, // @everyone role
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: config.requiredRoleId, // Required role
          deny: [PermissionFlagsBits.ViewChannel]
        }
      ]);
      console.log(`❌ Secondary channel "${secondaryChannel.name}" hidden from everyone (Primary: ${memberCount} < ${config.threshold} and Secondary is empty)`);
    }

  } catch (error) {
    console.error('❌ Error managing channel visibility:', error);
  }
}