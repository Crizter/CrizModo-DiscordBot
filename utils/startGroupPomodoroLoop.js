import { GroupSession } from "../models/GroupSession.js";
import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from "discord.js";

const dashboards = new Map(); // sessionId -> { channel, message }
export const activeGroupTimers = new Map(); // Export this so other files can use it

function buildProgressBar(completed, max) {
    const filled = "█".repeat(completed);
    const empty = "░".repeat(max - completed);
    return `${filled}${empty}`;
}

export async function startGroupPomodoroLoop(sessionId, client) {
    // Clear any existing timer
    const existingTimer = activeGroupTimers.get(sessionId);
    if (existingTimer) {
        clearTimeout(existingTimer);
        activeGroupTimers.delete(sessionId);
    }

    const session = await GroupSession.findOne({ sessionId, isActive: true });
    if (!session) {
        console.log(`❌ No active session found: ${sessionId}`);
        return;
    }

    const {
        workDuration,
        breakDuration,
        longBreakDuration,
        sessionsBeforeLongBreak,
        maxSessions,
        participants,
    } = session;

    // Get active participant IDs
    const userIds = participants.filter(p => p.isActive).map(p => p.userId);

    let completed = session.completedSessions || 0;

    const runCycle = async () => {
        const currentSession = await GroupSession.findOne({ sessionId, isActive: true });
        if (!currentSession) {
            console.log(`❌ Session no longer active: ${sessionId}`);
            activeGroupTimers.delete(sessionId);
            return;
        }

        if (completed >= maxSessions) {
            // End session
            currentSession.isActive = false;
            currentSession.status = 'completed';
            await currentSession.save();

            const { message } = dashboards.get(sessionId) || {};
            if (message) {
                const endEmbed = new EmbedBuilder()
                    .setTitle("✅ Group Pomodoro Completed!")
                    .setDescription("Great job, everyone! 🎉 Take some well-deserved rest.")
                    .setColor("Green");
                await message.edit({ embeds: [endEmbed], components: [] }).catch(() => {});
            }

            dashboards.delete(sessionId);
            activeGroupTimers.delete(sessionId);
            console.log(`🏁 Group session completed: ${sessionId}`);
            return;
        }

        const isLongBreak = completed > 0 && completed % sessionsBeforeLongBreak === 0;
        const currentPhase = isLongBreak ? "long_break" : (completed % 2 === 0 ? "study" : "break");
        const duration = currentPhase === "study"
            ? workDuration
            : currentPhase === "break"
            ? breakDuration
            : longBreakDuration;

        const endTime = new Date(Date.now() + duration * 60 * 1000);
        
        // Update session with current phase
        await GroupSession.updateOne(
            { sessionId },
            { 
                phase: currentPhase,
                actualEndTimestamp: endTime,
                completedSessions: currentPhase === "study" ? completed : Math.floor(completed / 2)
            }
        );

        const progressBar = buildProgressBar(Math.floor(completed / 2), maxSessions);
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
                .setCustomId(`group_skip_${sessionId}`)
                .setLabel("⏭️ Skip Phase")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`group_end_${sessionId}`)
                .setLabel("⛔ Stop Session")
                .setStyle(ButtonStyle.Danger)
        );

        const dashboard = dashboards.get(sessionId);
        if (dashboard?.message) {
            await dashboard.message.edit({ embeds: [embed], components: [row] }).catch(() => {});
        } else {
            try {
                // Find the channel where session was created
                let targetChannel = null;
                for (const [, guild] of client.guilds.cache) {
                    if (guild.id === currentSession.guildId) {
                        targetChannel = guild.channels.cache.get(currentSession.channelId);
                        break;
                    }
                }

                if (!targetChannel && userIds.length > 0) {
                    // Fallback: find any channel in a guild where participants are
                    const anyUser = await client.users.fetch(userIds[0]);
                    const guild = client.guilds.cache.find(g => g.members.cache.has(anyUser.id));
                    const member = guild?.members.cache.get(anyUser.id);
                    targetChannel = guild?.systemChannel || guild?.channels.cache.find(c => c.isTextBased() && c.viewable);
                }

                if (targetChannel) {
                    const msg = await targetChannel.send({ embeds: [embed], components: [row] });
                    dashboards.set(sessionId, { message: msg, channel: targetChannel });
                }
            } catch (error) {
                console.error(`❌ Failed to send group message for ${sessionId}:`, error);
            }
        }

        // Set timer for next cycle
        const timerId = setTimeout(() => {
            activeGroupTimers.delete(sessionId);
            runCycle();
        }, duration * 60 * 1000);

        activeGroupTimers.set(sessionId, timerId);
        completed++;
    };

    runCycle();
}

// Function to handle phase completion (for skip functionality)
export async function handleGroupPhaseCompletion(sessionId, client) {
    const timer = activeGroupTimers.get(sessionId);
    if (timer) {
        clearTimeout(timer);
        activeGroupTimers.delete(sessionId);
    }
    
    // This will restart the cycle from where it left off
    startGroupPomodoroLoop(sessionId, client);
}