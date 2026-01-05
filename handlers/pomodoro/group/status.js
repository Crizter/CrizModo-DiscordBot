import { getUserGroupSession } from "../../../utils/groupPomodoroManager.js";
import { getGroupSessionEmbed } from "../../../utils/getGroupSessionEmbed.js";

export async function handleGroupStatus(interaction, client) {
    const userId = interaction.user.id;

    try {
        // Find user's group session
        const groupSession = await getUserGroupSession(userId);
        if (!groupSession) {
            return await interaction.reply({
                content: "❌ You're not in any group session.",
                flags: 64
            });
        }

        // Generate current status embed
        const { embed, components } = await getGroupSessionEmbed(groupSession, userId);

        await interaction.reply({
            embeds: [embed],
            components: [], // Don't include action buttons in status view
            flags: 64
        });

        console.log(`📊 User ${userId} checked group session status: ${groupSession.sessionId}`);

    } catch (error) {
        console.error("❌ Error getting group session status:", error);
        await interaction.reply({
            content: "❌ Failed to get session status. Please try again.",
            flags: 64
        });
    }
}