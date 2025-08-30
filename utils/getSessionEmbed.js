import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { Session } from "../models/sessions.models.js";

export async function getSessionEmbed(userId) {
  try {
    const session = await Session.findOne({ userId, isActive: true });
    if (!session) {
      console.log(`❌ No active session found for embed generation for user ${userId}`);
      return { embed: null, components: [] };
    }

    const {
      phase,
      actualEndTimestamp,
      completedSessions,
      maxSessions,
      endTime
    } = session;

    let endTimestamp;

    if (actualEndTimestamp) {
      endTimestamp = Math.floor(new Date(actualEndTimestamp).getTime() / 1000);
    } else {
      // Fallback: calculate from current time + remaining duration
      console.log(`⚠️ No actualEndTimestamp found for user ${userId}, calculating fallback`);
      endTimestamp = Math.floor((Date.now() + (endTime * 60 * 1000)) / 1000);
    }
      
    const now = Math.floor(Date.now() / 1000);

    // Ensure endTimestamp is in the future
    if (endTimestamp <= now) {
      console.log(`⚠️ End time is in the past for user ${userId}. Now: ${now}, End: ${endTimestamp}`);
      console.log(`📊 Session data:`, { phase, endTime, actualEndTimestamp, completedSessions });
      
      // If time is in the past, set it to 1 minute from now as emergency fallback
      endTimestamp = now + 60;
    }

    const total = maxSessions;
    const filled = completedSessions;
    const empty = Math.max(0, total - filled);
    const progressBar = "█".repeat(filled) + "░".repeat(empty);

    const phaseDisplayNames = {
      study: "📚 Study Session",
      break: "☕ Short Break", 
      long_break: "🌴 Long Break"
    };

    const phaseColors = {
      study: 0x3498db,    // blue
      break: 0xf1c40f,    // yellow
      long_break: 0x2ecc71  // green
    };

    const embed = new EmbedBuilder()
      .setTitle("🍅 Pomodoro Session")
      .setDescription(
        `**${phaseDisplayNames[phase] || phase}**\n` +
        `**Ends <t:${endTimestamp}:R>** • <t:${endTimestamp}:T>\n\n` +
        `**Progress:**\n\`${progressBar}\``
      )
      .setColor(phaseColors[phase] || 0x95a5a6)
      .setFooter({
        text: `Session ${completedSessions} / ${maxSessions}`,
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("skip_phase")
        .setLabel("⏭️ Skip Phase")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("stop_session")
        .setLabel("⛔ Stop Session")
        .setStyle(ButtonStyle.Danger)
    );

    return { embed, components: [row] };
  } catch (error) {
    console.error("❌ Error generating session embed:", error);
    return { embed: null, components: [] };
  }
}