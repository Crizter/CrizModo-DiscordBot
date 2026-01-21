import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getActiveParticipantsCount, isHost } from "./groupPomodoroManager.js";

export async function getGroupSessionEmbed(groupSession, requestUserId = null) {
    try {
        const activeParticipants = groupSession.participants.filter(p => p.isActive);
        const participantCount = activeParticipants.length;
        
        // Calculate progress
        const total = groupSession.maxSessions;
        const completed = groupSession.completedSessions;
        const progressBar = "█".repeat(completed) + "░".repeat(Math.max(0, total - completed));

        // Phase display
        const phaseDisplayNames = {
            study: "📚 Study Session",
            break: "☕ Short Break",
            long_break: "🌴 Long Break"
        };

        const phaseColors = {
            waiting: 0x95a5a6,    // gray
            study: 0x3498db,      // blue
            break: 0xf1c40f,      // yellow
            long_break: 0x2ecc71, // green
            completed: 0x2ecc71   // green
        };

        let description = "";
        let footerText = `Session ID: ${groupSession.sessionId}`;

        if (groupSession.status === 'waiting') {
            description = "**⏳ Waiting for participants to join**\n" +
                         "Host will start the session when ready.";
        } else if (groupSession.status === 'active') {
            const endTimestamp = groupSession.actualEndTimestamp ? 
                Math.floor(new Date(groupSession.actualEndTimestamp).getTime() / 1000) : 
                Math.floor((Date.now() + 60000) / 1000); // Fallback
                
            description = `**${phaseDisplayNames[groupSession.phase]}**\n` +
                         `**Ends <t:${endTimestamp}:R>** • <t:${endTimestamp}:T>\n\n` +
                         `**Progress:**\n\`${progressBar}\``;
            
            footerText = `Session ${completed}/${total} • ${groupSession.sessionId}`;
        } else if (groupSession.status === 'completed') {
            description = "** Session Completed!**\nGreat work everyone! ";
        }

        // Participant list (show up to 8, then "and X more")
        let participantText = "";
        if (participantCount > 0) {
            const displayParticipants = activeParticipants.slice(0, 8);
            participantText = displayParticipants.map(p => 
                `<@${p.userId}>${p.userId === groupSession.hostUserId ? ' 👑' : ''}`
            ).join(" • ");
            
            if (participantCount > 8) {
                participantText += ` • *and ${participantCount - 8} more*`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`🍅 Group Pomodoro Session`)
            .setDescription(description)
            .setColor(phaseColors[groupSession.status] || phaseColors.waiting)
            .addFields(
                {
                    name: "⚙️ Settings",
                    value: `**Work:** ${groupSession.workDuration}m • **Break:** ${groupSession.breakDuration}m • **Long Break:** ${groupSession.longBreakDuration}m\n` +
                           `**Sessions before long break:** ${groupSession.sessionsBeforeLongBreak} • **Max sessions:** ${groupSession.maxSessions}`,
                    inline: false
                },
                {
                    name: `👥 Participants (${participantCount}/${groupSession.maxParticipants})`,
                    value: participantText || "*No participants*",
                    inline: false
                }
            )
            .setFooter({ text: footerText })
            .setTimestamp();

        // Create action buttons
        const components = [];
        const row1 = new ActionRowBuilder();
        const row2 = new ActionRowBuilder();

        if (groupSession.status === 'waiting') {
            // Waiting phase buttons
            row1.addComponents(
                new ButtonBuilder()
                    .setCustomId(`group_join_${groupSession.sessionId}`)
                    .setLabel("🚀 Join Session")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`group_start_${groupSession.sessionId}`)
                    .setLabel("▶️ Start Session")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`group_leave_${groupSession.sessionId}`)
                    .setLabel("🚪 Leave")
                    .setStyle(ButtonStyle.Secondary)
            );
            
            row2.addComponents(
                new ButtonBuilder()
                    .setCustomId(`group_end_${groupSession.sessionId}`)
                    .setLabel("❌ End Session")
                    .setStyle(ButtonStyle.Danger)
            );
            
            components.push(row1, row2);
        } else if (groupSession.status === 'active') {
            // Active phase buttons
            row1.addComponents(
                new ButtonBuilder()
                    .setCustomId(`group_skip_${groupSession.sessionId}`)
                    .setLabel("⏭️ Skip Phase")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`group_leave_${groupSession.sessionId}`)
                    .setLabel("🚪 Leave")
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`group_end_${groupSession.sessionId}`)
                    .setLabel("❌ End Session")
                    .setStyle(ButtonStyle.Danger)
            );
            
            components.push(row1);
        }

        return { embed, components };
    } catch (error) {
        console.error("❌ Error generating group session embed:", error);
        return { 
            embed: new EmbedBuilder()
                .setTitle("❌ Error")
                .setDescription("Failed to generate session embed")
                .setColor(0xff0000), 
            components: [] 
        };
    }
}