import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  Collection,
} from "discord.js";
import {
  data as pomodoroData,
  execute as pomodoroExecute,
} from "./commands/pomodoro.js";
import {
  data as roomActiveCheckData,
  execute as roomActiveCheckExecute,
} from "./commands/roomactivecheck.js";
import {
  data as listMembersData,
  execute as listMembersExecute,
} from "./commands/listMembers.js";
import {
  data as superverifyData,
  execute as superverifyExecute,
} from "./commands/superverify.js";
import {
  data as serverpulseData,
  execute as serverpulseExecute,
} from "./commands/serverpulse.js";
import {
  data as deepfocusData,
  execute as deepfocusExecute,
} from "./commands/deepfocus.js";
import {
  data as helpData,
  execute as helpExecute,
} from "./commands/help.js";
import { connectToCluster } from "./database/db.js";
import { handleRest } from "./handlers/pomodoro/rest.js";
import { handleStart } from "./handlers/pomodoro/start.js";
import { handleSetup } from "./handlers/pomodoro/setup.js";
import { handleStopSession } from "./handlers/pomodoro/stop.js";
import { handleSkip } from "./handlers/pomodoro/skip.js";
import { resumeAllActiveSessions } from "./utils/pomodoroScheduler.js";
import { resumeAllActiveGroupSessions } from "./utils/startGroupPomodoroLoop.js";
import { handleVoiceStateUpdate } from "./handlers/roomactivecheck/voiceStateUpdate.js";
import {
  initializeGuildFeatureState,
  removeGuildFeatureState,
} from "./utils/roomActiveCheckManager.js";
// Add this import for group button handling
import { handleGroupButtonInteraction } from "./handlers/pomodoro/group/buttonHandler.js";
import { handleTicketMessage } from "./handlers/tickets/messageHandler.js";
import { handleSuperVerificationApplyButton } from "./handlers/superVerification/applyButtonHandler.js";
import { handleSuperVerificationContinueButton } from "./handlers/superVerification/continueButtonHandler.js";
import { handleSuperVerificationModalSubmit } from "./handlers/superVerification/modalSubmitHandler.js";
import { handleSuperVerificationButton } from "./handlers/superVerification/reviewButtonHandler.js";
import { handlePulseVoiceStateUpdate } from "./handlers/serverPulse/voiceStateUpdate.js";
import {
  initializeGuildPulseState,
  removeGuildPulseState,
  getPulseConfig,
  schedulePulseRefresh,
  startHourFlushTick,
} from "./services/serverPulse/manager.js";
import { rehydrateFromGuild } from "./services/serverPulse/voiceHours.js";
import { handleDeepFocusButton } from "./handlers/deepFocus/buttonHandler.js";
import { handleDeepFocusChannelSelect } from "./handlers/deepFocus/channelPrompt.js";
import {
  startDeepFocusSweep,
  closeSessionForDepartedMember,
} from "./services/deepFocus/manager.js";
import { SUPER_VERIFICATION_APPLY_CHANNEL_ID } from "./config/constants.js";

// Create a new bot client with voice state intent
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates, // Added for voice channel monitoring
    GatewayIntentBits.GuildMembers, // Added for member access
    GatewayIntentBits.GuildMessages, // Added for ticket message watching
    GatewayIntentBits.MessageContent, // Added to read ticket message content
  ],
});

// Store commands
client.commands = new Collection();

// Define commands
const commands = [
  {
    name: "ping",
    description: "Replies with Pong!",
  },
  pomodoroData.toJSON(),
  roomActiveCheckData.toJSON(),
  listMembersData.toJSON(),
  superverifyData.toJSON(),
  serverpulseData.toJSON(),
  deepfocusData.toJSON(),
  helpData.toJSON(),
];

// Add commands to collection
client.commands.set("ping", {
  execute: async (interaction) => {
    await interaction.reply("🏓 Pong!");
  },
});
client.commands.set("pomodoro", { execute: pomodoroExecute });
client.commands.set("enable-roomactivecheck", { execute: roomActiveCheckExecute });
client.commands.set("listmembers", { execute: listMembersExecute });
client.commands.set("superverify", { execute: superverifyExecute });
client.commands.set("serverpulse", { execute: serverpulseExecute });
client.commands.set("deepfocus", { execute: deepfocusExecute });
client.commands.set("help", { execute: helpExecute });

// Initialize REST API
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

// Register the slash commands
async function registerCommands() {
  try {
    console.log("🚀 Registering slash commands for guild...");

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("✅ Slash commands registered for guild successfully!");
  } catch (error) {
    console.error("❌ Error registering slash commands:", error);
  }
}

// When the bot is ready
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Initialize room active check feature state for all guilds from database
  console.log("🔧 Initializing room active check system from database...");

  const initPromises = client.guilds.cache.map((guild) =>
    initializeGuildFeatureState(guild.id)
  );

  try {
    await Promise.all(initPromises);
    console.log("✅ Room active check system initialized from database");
  } catch (error) {
    console.error("❌ Error initializing room active check system:", error);
  }

  // Resume Pomodoro timers left running before the restart — otherwise
  // every in-progress solo/group session silently stops advancing forever.
  console.log("🔁 Resuming Pomodoro sessions from before restart...");
  try {
    await resumeAllActiveSessions(client);
    await resumeAllActiveGroupSessions(client);
  } catch (error) {
    console.error("❌ Error resuming Pomodoro sessions:", error);
  }

  // Initialize Server Pulse: seed the config cache, and for any guild that
  // already has it enabled, rehydrate the in-memory voice-hour tracker from
  // who's currently sitting in voice (bot restarts otherwise lose nothing
  // pre-restart — that's already flushed — but need a fresh "joined now"
  // cursor for anyone still connected) and do an initial refresh.
  console.log("🌐 Initializing Server Pulse system...");
  for (const guild of client.guilds.cache.values()) {
    try {
      await initializeGuildPulseState(guild.id);
      const config = await getPulseConfig(guild.id);
      if (config?.enabled) {
        rehydrateFromGuild(guild);
        schedulePulseRefresh(guild.id, client);
      }
    } catch (error) {
      console.error(`❌ Error initializing Server Pulse for guild ${guild.id}:`, error);
    }
  }
  startHourFlushTick(client);
  console.log("✅ Server Pulse system initialized");

  // Deep Focus expiry/recovery sweep — DB-driven, so restarts can't orphan a
  // session (expiry lives in expiresAt, not in an in-memory timer).
  startDeepFocusSweep(client);
  console.log("✅ Deep Focus sweep started");
});

// Handle interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(`❌ Error executing /${interaction.commandName}:`, error);
    await interaction.reply({
      content: "❌ An error occurred while executing this command.",
      flags: 64,
    });
  }
});

// Handle button interactions
client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    // Handle group button interactions FIRST (they have specific patterns)
    if (interaction.customId.startsWith('group_')) {
      return await handleGroupButtonInteraction(interaction, client);
    }

    // Deep Focus enter/exit buttons
    if (interaction.customId.startsWith('deepfocus_')) {
      return await handleDeepFocusButton(interaction, client);
    }

    // Super Verification buttons — order matters, most specific prefixes first
    if (interaction.customId === 'superverify_apply_start') {
      return await handleSuperVerificationApplyButton(interaction, client);
    }
    if (interaction.customId.startsWith('superverify_continue_')) {
      return await handleSuperVerificationContinueButton(interaction, client);
    }
    if (
      interaction.customId.startsWith('superverify_approve_') ||
      interaction.customId.startsWith('superverify_reject_')
    ) {
      return await handleSuperVerificationButton(interaction, client);
    }

    // Handle your existing group buttons (if any)
    if (interaction.customId.startsWith('skip_phase_') || interaction.customId.startsWith('stop_group_')) {
      // Your existing group button logic here
      console.log("Handling existing group button:", interaction.customId);
      return;
    }

    // Individual Pomodoro buttons
    switch (interaction.customId) {
      case "start_session":
        return handleStart(interaction, client);
      case "stop_session":
        return handleStopSession(interaction);
      case "skip_phase":
        return handleSkip(interaction);
    }
    return;
  }

  if (interaction.isChannelSelectMenu()) {
    if (interaction.customId === 'deepfocus_channel_select') {
      return await handleDeepFocusChannelSelect(interaction, client);
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('superverify_modal_')) {
      try {
        return await handleSuperVerificationModalSubmit(interaction, client);
      } catch (error) {
        console.error("❌ Error handling super verification modal:", error);
        return interaction.reply({
          content: "❌ Something went wrong processing that step. Please try again.",
          flags: 64,
        });
      }
    }
  }
});

// Handle voice state updates for room active check
client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);

// Dedicated Server Pulse voice listener — kept separate from
// roomactivecheck's handler above (that one has no debouncing and does a
// fetch + up to 3 permission writes per event; Server Pulse must not inherit
// that rate-limit risk under bursty voice joins).
client.on(Events.VoiceStateUpdate, handlePulseVoiceStateUpdate);

// Safety net: the Super Verification apply channel should be view-only for
// regular users (set via Discord channel permissions) — auto-delete any
// stray non-bot message there as a backstop.
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== SUPER_VERIFICATION_APPLY_CHANNEL_ID) return;
  await message.delete().catch((error) => {
    console.error("❌ Could not delete stray message in apply channel:", error.message);
  });
});

// Handle messages in ticket channels (future FAQ auto-reply)
client.on(Events.MessageCreate, async (message) => {
  try {
    await handleTicketMessage(message, client);
  } catch (error) {
    console.error("❌ Error handling ticket message:", error);
  }
});

// User leaves mid-Deep-Focus: close the session but KEEP savedRoleIds — the
// roles are gone with the membership, but staff can restore from the doc or
// the log message if they rejoin. No auto-restore on rejoin in v1.
client.on(Events.GuildMemberRemove, async (member) => {
  try {
    await closeSessionForDepartedMember(member.guild.id, member.id);
  } catch (error) {
    console.error("❌ Error closing Deep Focus session for departed member:", error);
  }
});

// Handle guild join events (set default feature state)
client.on(Events.GuildCreate, async (guild) => {
  try {
    await initializeGuildFeatureState(guild.id);
    await initializeGuildPulseState(guild.id);
    console.log(
      `🆕 Joined new guild and initialized database: ${guild.name} (${guild.id})`
    );
  } catch (error) {
    console.error(`❌ Error initializing guild ${guild.id}:`, error);
  }
});

// Handle guild leave events (cleanup feature state)
client.on(Events.GuildDelete, async (guild) => {
  try {
    await removeGuildFeatureState(guild.id);
    await removeGuildPulseState(guild.id);
    console.log(
      `👋 Left guild and cleaned up database: ${guild.name} (${guild.id})`
    );
  } catch (error) {
    console.error(`❌ Error cleaning up guild ${guild.id}:`, error);
  }
});

const uri = process.env.DATABASE_URL;

// Start the bot
async function main() {
  try {
    await registerCommands();
    await connectToCluster(uri);
    console.log("💾 Database connected successfully");

    await client.login(process.env.TOKEN);
  } catch (error) {
    console.error("❌ Error starting bot:", error);
    process.exit(1);
  }

  // Catch unhandled exceptions
  process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error);
  });

  process.on("unhandledRejection", (error) => {
    console.error("❌ Unhandled Rejection:", error);
  });
}

main();