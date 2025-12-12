const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const memory = require('../src/core/memory');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Manage your AI profile and memory')
        .addSubcommand(sub =>
            sub.setName('set_name')
                .setDescription('Set your preferred name')
                .addStringOption(opt => opt.setName('name').setDescription('Your name').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('set_bio')
                .setDescription('Set a bio or info for the bot to remember')
                .addStringOption(opt => opt.setName('bio').setDescription('Info about you').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View what the bot knows about you')
        )
        .addSubcommand(sub =>
            sub.setName('clear')
                .setDescription('Wipe your profile memory')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        if (sub === 'set_name') {
            const name = interaction.options.getString('name');
            memory.setProfile(userId, { name });
            await interaction.reply({ content: `✅ I'll call you **${name}** from now on.`, ephemeral: true });
        }
        else if (sub === 'set_bio') {
            const bio = interaction.options.getString('bio');
            memory.setProfile(userId, { bio });
            await interaction.reply({ content: `✅ Updated your bio context.`, ephemeral: true });
        }
        else if (sub === 'view') {
            const data = memory.getProfileData(userId);
            const discordName = interaction.member.displayName;
            const facts = data.facts;

            // Pagination Logic
            const ITEMS_PER_PAGE = 10;
            const totalPages = Math.ceil((facts.length || 1) / ITEMS_PER_PAGE);
            let currentPage = 0;

            const generateEmbed = (page) => {
                const start = page * ITEMS_PER_PAGE;
                const end = start + ITEMS_PER_PAGE;
                // If no facts, show empty message
                const pageFacts = facts.length > 0
                    ? facts.slice(start, end).map(f => `• ${f}`).join('\n')
                    : '(Nothing learned yet)';

                return new EmbedBuilder()
                    .setTitle(`🧠 Memory Profile: ${data.displayName || discordName}`)
                    .setColor(0x3498db)
                    .addFields(
                        { name: 'Preferred Name', value: data.displayName || '(Default)', inline: true },
                        { name: 'Bio', value: data.bio || '(Empty)', inline: true },
                        { name: 'Learned Facts', value: pageFacts }
                    )
                    .setFooter(totalPages > 1 ? { text: `Page ${page + 1} of ${totalPages}` } : null);
            };

            const generateButtons = (page) => {
                const row = new ActionRowBuilder();

                const prevBtn = new ButtonBuilder()
                    .setCustomId('prev_profile')
                    .setLabel('◀')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0);

                const nextBtn = new ButtonBuilder()
                    .setCustomId('next_profile')
                    .setLabel('▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages - 1);

                row.addComponents(prevBtn, nextBtn);
                return row;
            };

            const embed = generateEmbed(currentPage);
            const components = totalPages > 1 ? [generateButtons(currentPage)] : [];

            const response = await interaction.reply({
                embeds: [embed],
                components: components,
                ephemeral: true
            });

            if (totalPages > 1) {
                const collector = response.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 60000
                });

                collector.on('collect', async i => {
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({ content: "These buttons aren't for you!", ephemeral: true });
                    }

                    if (i.customId === 'prev_profile') {
                        if (currentPage > 0) currentPage--;
                    } else if (i.customId === 'next_profile') {
                        if (currentPage < totalPages - 1) currentPage++;
                    }

                    await i.update({
                        embeds: [generateEmbed(currentPage)],
                        components: [generateButtons(currentPage)]
                    });
                });

                collector.on('end', () => {
                    // Disable buttons after timeout
                    /* Can't easily update ephemeral message after timeout without keeping reference?
                       Actually, we can use interaction.editReply if we have it?
                       Ephemeral messages are tricky to edit later if token expires.
                       For now, let them die or try editReply.
                    */
                    interaction.editReply({ components: [] }).catch(() => { });
                });
            }
        }
        else if (sub === 'clear') {
            memory.clearProfile(userId);
            await interaction.reply({ content: `🗑️ Memory wiped. Who are you again?`, ephemeral: true });
        }
    },
};
