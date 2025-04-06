// utils/pomodoroScheduler.js
import { GroupSession } from "../models/groupSessions.models.js";
import { Session } from "../models/sessions.models.js";
import { sendGroupDashboardEmbed } from "./sendGroupDashboardEmbed.js";
import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
  } from "discord.js";
  

const dashboards = new Map(); // groupId -> { channel, message }

function buildProgressBar(completed, max) {
  const filled = "█".repeat(completed);
  const empty = "░".repeat(max - completed);
  return `${filled}${empty}`;
}

export async function startGroupPomodoroLoop(groupId, client) {
  const session = await GroupSession.findOne({ groupId, isActive: true });
  if (!session) return;

  const {
    workDuration,
    breakDuration,
    longBreakDuration,
    sessionsBeforeLongBreak,
    maxSessions,
    userIds,
  } = session;

  let completed = 0;

  const runCycle = async () => {
    if (completed >= maxSessions) {
      session.isActive = false;
      await session.save();

      const { message } = dashboards.get(groupId) || {};
      if (message) {
        const endEmbed = new EmbedBuilder()
          .setTitle("✅ Group Pomodoro Completed!")
          .setDescription("Great job, everyone! 🎉 Take some well-deserved rest.")
          .setColor("Green");
        await message.edit({ embeds: [endEmbed], components: [] });
      }

      dashboards.delete(groupId);
      return;
    }

    const isLongBreak = completed > 0 && completed % sessionsBeforeLongBreak === 0;
    const currentPhase = isLongBreak ? "longBreak" : (completed % 2 === 0 ? "study" : "break");
    const duration = currentPhase === "study"
      ? workDuration
      : currentPhase === "break"
      ? breakDuration
      : longBreakDuration;

    const endTime = new Date(Date.now() + duration * 60 * 1000);
    session.currentPhase = currentPhase;
    session.endTime = endTime;
    await session.save();

    const progressBar = buildProgressBar(completed, maxSessions);
    const embed = new EmbedBuilder()
      .setTitle(`👥 Group Pomodoro — ${currentPhase === "study" ? "Focus Time" : isLongBreak ? "Long Break" : "Break"}`)
      .setDescription(
        `⏳ Duration: **${duration} mins**\n` +
        `🕒 Ends <t:${Math.floor(endTime.getTime() / 1000)}:R>\n\n` +
        `📈 Progress: \`${progressBar}\``
      )
      .setColor(currentPhase === "study" ? "Red" : isLongBreak ? "Blue" : "Green");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`skip_phase_${groupId}`)
        .setLabel("⏭️ Skip Phase")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`stop_group_${groupId}`)
        .setLabel("⛔ Stop Session")
        .setStyle(ButtonStyle.Danger)
    );

    const dashboard = dashboards.get(groupId);
    if (dashboard?.message) {
      await dashboard.message.edit({ embeds: [embed], components: [row] });
    } else {
      const anyUser = await client.users.fetch(userIds[0]);
      const guild = client.guilds.cache.find(g => g.members.cache.has(anyUser.id));
      const member = guild?.members.cache.get(anyUser.id);
      const channel = member?.voice.channel?.guild?.systemChannel || guild?.channels.cache.find(c => c.isTextBased() && c.viewable);
      const msg = await channel.send({ embeds: [embed], components: [row] });
      dashboards.set(groupId, { message: msg, channel });
    }

    setTimeout(runCycle, duration * 60 * 1000);
    completed++;
  };

  runCycle();
}