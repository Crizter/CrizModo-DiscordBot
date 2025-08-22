import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

/**
 * Handles the /listmembers command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 */
export async function handleListMembers(interaction, client) {
    // Wait for the bot to process
    await interaction.deferReply();
    const guildId = interaction.guildId;

    if (!guildId) {
        return await interaction.editReply({
            content: 'This command can only be used in a server',
            ephemeral: true
        });
    }

    // Check if user has manage roles permission
    if (!interaction.member.permissions.has('ManageRoles')) {
        return await interaction.editReply({
            content: '❌ You need the "Manage Roles" permission to use this command.',
            ephemeral: true
        });
    }

    // Get the roles from the command
    const roles = [];
    for (let i = 1; i <= 5; i++) {
        const role = interaction.options.getRole(`role${i}`);
        if (role) {
            roles.push(role);
        }
    }

    if (roles.length === 0) {
        return await interaction.editReply({
            content: '❌ No roles selected',
            ephemeral: true
        });
    }

    const showAll = interaction.options.getBoolean('show-all') || false;
    const removeRoles = interaction.options.getBoolean('remove-roles') || false;

    try {
        // Fetch all members
        const allMembers = await interaction.guild.members.fetch();

        let filteredMembers;

        if (removeRoles) {
            // For role removal: find ALL members who have ANY of the specified roles
            filteredMembers = allMembers.filter(member => {
                return roles.some(role => member.roles.cache.has(role.id));
            });
        } else {
            // For display: use the show-all logic
            filteredMembers = allMembers.filter(member => {
                if (showAll) {
                    // Member has ANY of the specified roles
                    return roles.some(role => member.roles.cache.has(role.id));
                } else {
                    // Member has ALL of the specified roles
                    return roles.every(role => member.roles.cache.has(role.id));
                }
            });
        }

        if (filteredMembers.size === 0) {
            if (removeRoles) {
                return await interaction.editReply({
                    content: `❌ No members found with any of the specified roles: ${roles.map(r => r.name).join(', ')}`,
                    ephemeral: true
                });
            } else {
                const filterType = showAll ? 'any' : 'all';
                return await interaction.editReply({
                    content: `❌ No members found with ${filterType} of the specified roles: ${roles.map(r => r.name).join(', ')}`,
                    ephemeral: true
                });
            }
        }

        if (removeRoles) {
            // Handle role removal
            await handleRoleRemoval(interaction, filteredMembers, roles, client);
        } else {
            // Just show the member list
            await createMemberListEmbed(interaction, filteredMembers, roles, showAll);
        }

    } catch (error) {
        console.error('❌ Error in handleListMembers:', error);
        await interaction.editReply({
            content: '❌ An error occurred while processing your request.',
            ephemeral: true
        });
    }
}

/**
 * Handle removing roles from members
 */
async function handleRoleRemoval(interaction, members, roles, client) {
    // Check if bot can manage the roles
    const botMember = interaction.guild.members.cache.get(client.user.id);
    if (!botMember.permissions.has('ManageRoles')) {
        return await interaction.editReply({
            content: '❌ I don\'t have permission to manage roles.',
            ephemeral: true
        });
    }

    // Check if any of the roles are too high for the bot to manage
    const unmanageableRoles = roles.filter(role => 
        role.position >= botMember.roles.highest.position
    );

    if (unmanageableRoles.length > 0) {
        return await interaction.editReply({
            content: `❌ I cannot remove the following roles because they're higher than or equal to my highest role: ${unmanageableRoles.map(r => r.name).join(', ')}`,
            ephemeral: true
        });
    }

    // Show confirmation dialog
    await confirmRoleRemoval(interaction, members, roles);
}

/**
 * Create paginated embed for member list
 */
async function createMemberListEmbed(interaction, members, roles, showAll) {
    const membersArray = Array.from(members.values());
    const itemsPerPage = 15;
    const totalPages = Math.ceil(membersArray.length / itemsPerPage);
    let currentPage = 0;

    const generateEmbed = (page) => {
        const start = page * itemsPerPage;
        const end = start + itemsPerPage;
        const pageMembers = membersArray.slice(start, end);

        const embed = new EmbedBuilder()
            .setTitle('👥 Member List')
            .setDescription(`Members with ${showAll ? 'any' : 'all'} of the roles: ${roles.map(r => `<@&${r.id}>`).join(', ')}`)
            .setColor(0x0099ff)
            .setFooter({ 
                text: `Page ${page + 1} of ${totalPages} • Total members: ${members.size}` 
            })
            .setTimestamp();

        const memberList = pageMembers.map((member, index) => {
            const globalIndex = start + index + 1;
            
            // Show which of the specified roles this member has
            const memberSpecifiedRoles = roles.filter(role => 
                member.roles.cache.has(role.id)
            ).map(role => role.name);
            
            const otherRoles = member.roles.cache
                .filter(role => 
                    role.id !== interaction.guild.roles.everyone.id && 
                    !roles.some(specifiedRole => specifiedRole.id === role.id)
                )
                .map(role => role.name)
                .slice(0, 2); // Show only first 2 other roles
            
            let roleDisplay = '';
            if (memberSpecifiedRoles.length > 0) {
                roleDisplay += `**Target roles:** ${memberSpecifiedRoles.join(', ')}`;
                if (otherRoles.length > 0) {
                    roleDisplay += ` | *Others: ${otherRoles.join(', ')}*`;
                }
            }
            
            return `${globalIndex}. **${member.displayName}** (${member.user.tag})${roleDisplay ? `\n   └ ${roleDisplay}` : ''}`;
        }).join('\n\n');

        embed.addFields({
            name: 'Members',
            value: memberList || 'No members found',
            inline: false
        });

        return embed;
    };

    const embed = generateEmbed(currentPage);
    
    // Create buttons for pagination and role removal
    const row = new ActionRowBuilder();
    
    if (totalPages > 1) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('listmembers_prev')
                .setLabel('◀ Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0),
            new ButtonBuilder()
                .setCustomId('listmembers_next')
                .setLabel('Next ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === totalPages - 1)
        );
    }

    // Add remove roles button
    row.addComponents(
        new ButtonBuilder()
            .setCustomId('remove_roles_from_listed')
            .setLabel('🗑️ Remove Target Roles')
            .setStyle(ButtonStyle.Danger)
    );

    const response = await interaction.editReply({
        embeds: [embed],
        components: [row]
    });

    // Handle interactions
    const collector = response.createMessageComponentCollector({ time: 300000 }); // 5 minutes

    collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
            return await i.reply({
                content: '❌ Only the command user can use these buttons.',
                ephemeral: true
            });
        }

        if (i.customId === 'listmembers_prev') {
            currentPage = Math.max(0, currentPage - 1);
            const newEmbed = generateEmbed(currentPage);
            const newRow = new ActionRowBuilder();
            
            if (totalPages > 1) {
                newRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('listmembers_prev')
                        .setLabel('◀ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('listmembers_next')
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === totalPages - 1)
                );
            }
            
            newRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('remove_roles_from_listed')
                    .setLabel('🗑️ Remove Target Roles')
                    .setStyle(ButtonStyle.Danger)
            );

            await i.update({
                embeds: [newEmbed],
                components: [newRow]
            });

        } else if (i.customId === 'listmembers_next') {
            currentPage = Math.min(totalPages - 1, currentPage + 1);
            const newEmbed = generateEmbed(currentPage);
            const newRow = new ActionRowBuilder();
            
            if (totalPages > 1) {
                newRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('listmembers_prev')
                        .setLabel('◀ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('listmembers_next')
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === totalPages - 1)
                );
            }
            
            newRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('remove_roles_from_listed')
                    .setLabel('🗑️ Remove Target Roles')
                    .setStyle(ButtonStyle.Danger)
            );

            await i.update({
                embeds: [newEmbed],
                components: [newRow]
            });

        } else if (i.customId === 'remove_roles_from_listed') {
            // Handle role removal - get fresh member list with ANY of the target roles
            await i.deferUpdate();
            
            // Re-fetch members who have ANY of the target roles for removal
            const allMembers = await interaction.guild.members.fetch();
            const membersForRemoval = allMembers.filter(member => {
                return roles.some(role => member.roles.cache.has(role.id));
            });
            
            await handleRoleRemoval(interaction, membersForRemoval, roles, interaction.client);
        }
    });

    collector.on('end', () => {
        // Disable buttons after timeout
        const disabledRow = new ActionRowBuilder();
        
        if (totalPages > 1) {
            disabledRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('listmembers_prev')
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('listmembers_next')
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );
        }
        
        disabledRow.addComponents(
            new ButtonBuilder()
                .setCustomId('remove_roles_from_listed')
                .setLabel('🗑️ Remove Target Roles')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
        );

        interaction.editReply({ components: [disabledRow] }).catch(() => {});
    });
}

/**
 * Confirm role removal before proceeding
 */
async function confirmRoleRemoval(interaction, members, roles) {
    // Count how many members actually have each role
    const roleStats = roles.map(role => {
        const count = members.filter(member => member.roles.cache.has(role.id)).size;
        return `• **${role.name}**: ${count} members`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setTitle('⚠️ Confirm Role Removal')
        .setDescription(`You are about to remove roles from members. Here's what will be removed:`)
        .setColor(0xff9900)
        .setTimestamp();

    embed.addFields({
        name: '🎭 Roles to Remove (and member counts)',
        value: roleStats,
        inline: false
    });

    const memberList = Array.from(members.values()).slice(0, 10).map(member => {
        const memberTargetRoles = roles.filter(role => 
            member.roles.cache.has(role.id)
        ).map(role => role.name);
        
        return `• ${member.displayName} (${member.user.tag}) - *${memberTargetRoles.join(', ')}*`;
    }).join('\n');

    embed.addFields({
        name: `👥 Affected Members ${members.size > 10 ? '(first 10 shown)' : ''}`,
        value: memberList,
        inline: false
    });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_remove_roles')
                .setLabel('✅ Confirm Removal')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('cancel_remove_roles')
                .setLabel('❌ Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

    const response = await interaction.editReply({
        embeds: [embed],
        components: [row]
    });

    const collector = response.createMessageComponentCollector({ time: 30000 }); // 30 seconds

    collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
            return await i.reply({
                content: '❌ Only the command user can confirm this action.',
                ephemeral: true
            });
        }

        if (i.customId === 'confirm_remove_roles') {
            await i.update({
                content: '🔄 Removing roles from members...',
                embeds: [],
                components: []
            });

            await executeRoleRemoval(interaction, members, roles);
        } else if (i.customId === 'cancel_remove_roles') {
            await i.update({
                content: '❌ Role removal cancelled.',
                embeds: [],
                components: []
            });
        }

        collector.stop();
    });

    collector.on('end', (collected) => {
        if (collected.size === 0) {
            interaction.editReply({
                content: '⏰ Confirmation timed out. Role removal cancelled.',
                embeds: [],
                components: []
            }).catch(() => {});
        }
    });
}

/**
 * Execute the role removal process
 */
async function executeRoleRemoval(interaction, members, roles) {
    let totalSuccessCount = 0;
    let totalFailureCount = 0;
    const roleResults = {};

    // Initialize results tracking for each role
    roles.forEach(role => {
        roleResults[role.id] = {
            name: role.name,
            success: 0,
            failures: []
        };
    });

    // Process members in batches to avoid rate limits
    const batchSize = 10;
    const memberArray = Array.from(members.values());

    for (let i = 0; i < memberArray.length; i += batchSize) {
        const batch = memberArray.slice(i, i + batchSize);
        
        const promises = batch.map(async (member) => {
            for (const role of roles) {
                // Only try to remove if the member actually has this role
                if (member.roles.cache.has(role.id)) {
                    try {
                        await member.roles.remove(role, `Role removed by ${interaction.user.tag} via /listmembers command`);
                        roleResults[role.id].success++;
                        totalSuccessCount++;
                    } catch (error) {
                        roleResults[role.id].failures.push(`${member.displayName}: ${error.message}`);
                        totalFailureCount++;
                    }
                }
            }
        });

        await Promise.all(promises);
        
        // Small delay between batches to respect rate limits
        if (i + batchSize < memberArray.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // Create result embed
    const resultEmbed = new EmbedBuilder()
        .setTitle('📊 Role Removal Results')
        .setColor(totalSuccessCount > totalFailureCount ? 0x00ff00 : 0xff0000)
        .setTimestamp()
        .addFields(
            {
                name: '✅ Total Successful Removals',
                value: totalSuccessCount.toString(),
                inline: true
            },
            {
                name: '❌ Total Failed Removals',
                value: totalFailureCount.toString(),
                inline: true
            },
            {
                name: '👥 Members Processed',
                value: members.size.toString(),
                inline: true
            }
        );

    // Add details for each role
    roles.forEach(role => {
        const result = roleResults[role.id];
        resultEmbed.addFields({
            name: `🎭 ${result.name}`,
            value: `✅ ${result.success} removed | ❌ ${result.failures.length} failed`,
            inline: true
        });
    });

    // Show some failure examples if any
    const allFailures = Object.values(roleResults).flatMap(r => r.failures);
    if (allFailures.length > 0) {
        const failureList = allFailures.slice(0, 5).join('\n');
        resultEmbed.addFields({
            name: `❌ Sample Failures ${allFailures.length > 5 ? '(first 5 shown)' : ''}`,
            value: failureList,
            inline: false
        });
    }

    await interaction.editReply({
        content: `✅ Role removal completed! Removed roles from **${totalSuccessCount}** role assignments across **${members.size}** members.`,
        embeds: [resultEmbed]
    });
}