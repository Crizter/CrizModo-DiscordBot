// pomodoroScheduler.js
import { Session } from "../models/sessions.models.js";
import { getSessionEmbed } from "./getsessionEmbed.js";
import {
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
  } from "discord.js";

  
export const activeTimers = new Map();

export async function startPomodoroLoop(userId, client) {
  const session = await Session.findOne({ userId, isActive: true });
  if (!session) return;

  const durations = {
    study: session.workDuration,
    break: session.breakDuration,
    longBreak: session.longBreakDuration,
  };

  const totalSessionsBeforeLongBreak = session.sessionsBeforeLongBreak;
  const maxSessions = session.maxSessions || totalSessionsBeforeLongBreak;

  let completedSessions = session.completedSessions || 0;


  console.log(`▶️ Pomodoro started for ${userId}`);
  console.log(`⏱️ Work: ${durations.study}m | Break: ${durations.break}m | Long Break: ${durations.longBreak}m | Sessions before long break: ${totalSessionsBeforeLongBreak} | Max sessions: ${maxSessions}`);

  const runPhase = async (phase, duration) => {
    console.log(`🔁 Starting ${phase} phase for ${duration} minute(s)...`);

    await Session.updateOne(
      { userId },
      {
        currentPhase: phase,
        endTime: new Date(Date.now() + duration * 60 * 1000),
        completedSessions,
      }
    );

    await remindUser(userId, phase, duration, client);

    return new Promise((resolve) => {
      const timeoutId = setTimeout(resolve, duration * 60 * 1000);
      activeTimers.set(userId, timeoutId);
    });
  };

  const loop = async () => {
    while (completedSessions < maxSessions) {
      for (let i = 0; i < totalSessionsBeforeLongBreak && completedSessions < maxSessions; i++) {
        await runPhase("study", durations.study);
        completedSessions++;

        if (completedSessions < maxSessions) {
          await runPhase("break", durations.break);
        }

        console.log(`✅ Session ${completedSessions} of ${maxSessions} done`);
      }

      if (completedSessions < maxSessions) {
        await runPhase("longBreak", durations.longBreak);
        console.log(`🌴 Took a long break after ${completedSessions} sessions`);
      }
    }

    await Session.updateOne({ userId }, { isActive: false });
    activeTimers.delete(userId);
    // Mention the user in their server
    const userMention = `<@${userId}>`;

    
try {
  const guilds = client.guilds.cache;
  for (const [, guild] of guilds) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;

    const message = `🏁 ${userMention} Your Pomodoro session is **complete**! Great job today 🎉;`

    const voiceChannel = member.voice?.channel;
    const textChannel =
      guild.systemChannel || guild.channels.cache.find((ch) => ch.isTextBased() && ch.viewable);

    if (voiceChannel?.sendable) {
      voiceChannel.send(message).catch(() => {});
    } else if (textChannel) {
      textChannel.send(message).catch(() => {});
    }

    break;
  }
} catch (err) {
  console.error("❌ Failed to send session completion message:", err);
}
  
console.log(`🏁 Pomodoro complete for ${userId}. Session ended.`);
};
    


  loop();
}
async function remindUser(userId, phase, duration, client) {
    try {
      const guilds = client.guilds.cache;
      for (const [, guild] of guilds) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) continue;
  
        const voiceChannel = member.voice?.channel;
        const textChannel =
          guild.systemChannel ||
          guild.channels.cache.find((ch) => ch.isTextBased() && ch.viewable);
  
        const { embed, components } = await getSessionEmbed(userId);
        const message = `⏰ <@${userId}> ${
          phase === "study"
            ? `Time to focus!`
            : phase === "break"
            ? `Break time!`
            : `Long break time!`
        }`;
  
        if (voiceChannel?.sendable) {
          voiceChannel.send({ content: message, embeds: [embed], components }).catch(() => {});
        } else if (textChannel) {
          textChannel.send({ content: message, embeds: [embed], components }).catch(() => {});
        }
  
        console.log(`📣 Sent reminder and embed for phase: ${phase}`);
        break;
      }
    } catch (err) {
      console.error("❌ Reminder error:", err);
    }
  }
