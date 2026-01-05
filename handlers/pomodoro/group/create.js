import { GroupSession } from "../../../models/GroupSession.js";
import { 
    generateSessionId, 
    hasActiveSession, 
    getDefaultSettings 
} from "../../../utils/groupPomodoroManager.js";
import { getGroupSessionEmbed } from "../../../utils/getGroupSessionEmbed.js";

export async function handleGroupCreate(interaction, client) {
    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    try {
        // Check if user already has an active session
        const existingSession = await hasActiveSession(userId);
        if (existingSession) {
            return await interaction.reply({
                content: `❌ You already have an active ${existingSession.type} session. End it first before creating a group session.`,
                flags: 64
            });
        }

        // Check if there's already an active group session in this channel
        const existingGroupSession = await GroupSession.findOne({
            guildId,
            channelId,
            status: { $in: ['waiting', 'active'] }
        });

        if (existingGroupSession) {
            return await interaction.reply({
                content: `❌ There's already an active group session in this channel. Session ID: \`${existingGroupSession.sessionId}\``,
                flags: 64
            });
        }

        // Get settings from command or user defaults
        const userDefaults = await getDefaultSettings(userId);
        
        const settings = {
            workDuration: interaction.options.getInteger("work") || userDefaults.workDuration,
            breakDuration: interaction.options.getInteger("break") || userDefaults.breakDuration,
            longBreakDuration: interaction.options.getInteger("longbreak") || userDefaults.longBreakDuration,
            sessionsBeforeLongBreak: interaction.options.getInteger("sessions") || userDefaults.sessionsBeforeLongBreak,
            maxSessions: interaction.options.getInteger("max-sessions") || userDefaults.maxSessions
        };

        // Generate unique session ID
        let sessionId;
        let attempts = 0;
        do {
            sessionId = generateSessionId();
            attempts++;
        } while (await GroupSession.findOne({ sessionId }) && attempts < 10);

        if (attempts >= 10) {
            return await interaction.reply({
                content: "❌ Failed to generate unique session ID. Please try again.",
                flags: 64
            });
        }

        // Create group session
        const groupSession = new GroupSession({
            sessionId,
            guildId,
            channelId,
            hostUserId: userId,
            ...settings,
            participants: [{
                userId,
                joinedAt: new Date(),
                isActive: true
            }]
        });

        await groupSession.save();

        // Generate embed and components
        const { embed, components } = await getGroupSessionEmbed(groupSession);

        await interaction.reply({
            content: `🍅 **Group Pomodoro Session Created!**\n\n` +
                     `**Session ID:** \`${sessionId}\`\n` +
                     `You are the host of this session. Other users can join by clicking the button below or using \`/pomodoro group join ${sessionId}\`\n\n` +
                     `**Click "Start Session" when everyone has joined!**`,
            embeds: [embed],
            components
        });

        console.log(`🎯 Group session created: ${sessionId} by ${userId} in guild ${guildId}`);

    } catch (error) {
        console.error("❌ Error creating group session:", error);
        await interaction.reply({
            content: "❌ Failed to create group session. Please try again.",
            flags: 64
        });
    }
}