require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  Events,
} = require('discord.js');

// =====================================================
// CRAFTED SMP SUPPORT BOT
// =====================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

const GUILD_ID = '1543363950262100118';
const SUPPORT_PANEL_CHANNEL_ID = '1543375387088781483';
const TICKET_CATEGORY_ID = '1548760763655520336';
const CLOSED_TICKET_LOG_CHANNEL_ID = process.env.CLOSED_TICKET_LOG_CHANNEL_ID;

const GENERAL_STAFF_ROLE_ID = '1543373922668388482';
const SENIOR_STAFF_ROLE_ID = '1543367669385011302';
const OWNER_ROLE_ID = '1546564866045902978';
const CO_OWNER_ROLE_ID = '1548519417992974356';

const STAFF_ROLE_IDS = [
  GENERAL_STAFF_ROLE_ID,
  SENIOR_STAFF_ROLE_ID,
  OWNER_ROLE_ID,
  CO_OWNER_ROLE_ID,
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

function cleanChannelName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
}

function isStaff(member) {
  return STAFF_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
}

function createTicketTopic(ownerId, type) {
  return `CRAFTED_SUPPORT|owner=${ownerId}|type=${type}`;
}

function getTicketOwner(channel) {
  if (!channel.topic) return null;
  const match = channel.topic.match(/owner=(\d+)/);
  return match ? match[1] : null;
}

async function createSupportPanel(guild) {
  const channel = await guild.channels.fetch(SUPPORT_PANEL_CHANNEL_ID);

  if (!channel) {
    throw new Error('Support panel channel was not found.');
  }

  const recentMessages = await channel.messages.fetch({ limit: 20 });

  const existingPanel = recentMessages.find(
    (message) =>
      message.author.id === client.user.id &&
      message.embeds[0]?.title === '🎫 Crafted SMP Support'
  );

  if (existingPanel) {
    console.log('✅ Support panel already exists.');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🎫 Crafted SMP Support')
    .setDescription(
      [
        'Need help?',
        '',
        'Choose how you want your support ticket handled.',
        '',
        '👤 **Specific Person**',
        'Choose one person who can see your ticket.',
        '',
        '🛡️ **All Staff**',
        'Make a normal private support ticket for staff.',
        '',
        '👥 **Specific Staff Groups**',
        'Choose which staff groups can see your ticket.',
        '',
        'Your ticket will be created as a private channel.',
      ].join('\n')
    )
    .setColor(0x3498db)
    .setFooter({ text: 'Crafted SMP Support System' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_specific_user')
      .setLabel('Specific Person')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ticket_all_staff')
      .setLabel('All Staff')
      .setEmoji('🛡️')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('ticket_specific_groups')
      .setLabel('Staff Groups')
      .setEmoji('👥')
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [row] });
  console.log('✅ Support panel created.');
}

async function createTicket({
  guild,
  member,
  type,
  allowedUsers = [],
  allowedRoles = [],
}) {
  const existingTicket = guild.channels.cache.find(
    (channel) =>
      channel.parentId === TICKET_CATEGORY_ID &&
      getTicketOwner(channel) === member.id
  );

  if (existingTicket) {
    return {
      success: false,
      message: `You already have an open ticket: ${existingTicket}`,
    };
  }

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: member.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ],
    },
    {
      id: client.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ],
    },
  ];

  if (type !== 'all_staff') {
    permissionOverwrites.push(
      {
        id: OWNER_ROLE_ID,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: CO_OWNER_ROLE_ID,
        deny: [PermissionsBitField.Flags.ViewChannel],
      }
    );
  }

  for (const userId of allowedUsers) {
    permissionOverwrites.push({
      id: userId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ],
    });
  }

  for (const roleId of allowedRoles) {
    permissionOverwrites.push({
      id: roleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ],
    });
  }

  const channelName =
    cleanChannelName(`ticket-${member.user.username}`) +
    `-${member.id.slice(-4)}`;

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: TICKET_CATEGORY_ID,
    topic: createTicketTopic(member.id, type),
    permissionOverwrites,
  });

  const closeButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );

  let privacyText = '';

  if (type === 'specific_user') {
    privacyText =
      'Only you and the person you selected can access this ticket.';
  }

  if (type === 'all_staff') {
    privacyText =
      'You and the Crafted SMP staff team can access this ticket.';
  }

  if (type === 'specific_groups') {
    privacyText =
      'Only you and the staff groups you selected can access this ticket.';
  }

  const embed = new EmbedBuilder()
    .setTitle('🎫 Support Ticket')
    .setDescription(
      [
        `Welcome ${member}.`,
        '',
        privacyText,
        '',
        'Explain what you need help with below.',
        '',
        'When the issue is finished, press **Close Ticket**.',
      ].join('\n')
    )
    .setColor(0x2ecc71)
    .setFooter({ text: `Ticket owner: ${member.user.username}` });

  await ticketChannel.send({
    content: `${member}`,
    embeds: [embed],
    components: [closeButton],
  });

  return { success: true, channel: ticketChannel };
}

async function createTranscript(channel) {
  let allMessages = [];
  let lastId;

  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;

    allMessages.push(...messages.values());
    lastId = messages.last().id;

    if (messages.size < 100) break;
  }

  allMessages = allMessages.sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp
  );

  const lines = [
    '==========================================',
    'CRAFTED SMP SUPPORT TICKET TRANSCRIPT',
    '==========================================',
    '',
    `Channel: #${channel.name}`,
    `Channel ID: ${channel.id}`,
    `Created: ${new Date(channel.createdTimestamp).toLocaleString()}`,
    '',
    '==========================================',
    '',
  ];

  for (const message of allMessages) {
    const date = new Date(message.createdTimestamp).toLocaleString();

    lines.push(
      `[${date}] ${message.author.tag} (${message.author.id})`,
      message.content || '[No text content]'
    );

    if (message.attachments.size > 0) {
      lines.push('Attachments:');
      for (const attachment of message.attachments.values()) {
        lines.push(`- ${attachment.url}`);
      }
    }

    if (message.embeds.length > 0) {
      lines.push(`[${message.embeds.length} embed(s)]`);
    }

    lines.push('');
  }

  return new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), {
    name: `${channel.name}-transcript.txt`,
  });
}

async function closeTicket(interaction) {
  const channel = interaction.channel;
  const ticketOwnerId = getTicketOwner(channel);

  if (!ticketOwnerId) {
    return interaction.reply({
      content: '❌ This does not appear to be a support ticket.',
      ephemeral: true,
    });
  }

  const canClose =
    interaction.user.id === ticketOwnerId || isStaff(interaction.member);

  if (!canClose) {
    return interaction.reply({
      content: '❌ Only the ticket creator or staff can close this ticket.',
      ephemeral: true,
    });
  }

  await interaction.reply({
    content: '🔒 Closing ticket and creating transcript...',
    ephemeral: true,
  });

  let transcript;

  try {
    transcript = await createTranscript(channel);
  } catch (error) {
    console.error('Transcript error:', error);
  }

  if (CLOSED_TICKET_LOG_CHANNEL_ID) {
    try {
      const logChannel = await interaction.guild.channels.fetch(
        CLOSED_TICKET_LOG_CHANNEL_ID
      );

      if (logChannel) {
        const ticketOwner = await interaction.guild.members
          .fetch(ticketOwnerId)
          .catch(() => null);

        const logEmbed = new EmbedBuilder()
          .setTitle('🔒 Support Ticket Closed')
          .addFields(
            {
              name: 'Ticket',
              value: `#${channel.name}`,
              inline: true,
            },
            {
              name: 'Created By',
              value: ticketOwner
                ? `${ticketOwner.user.tag} (${ticketOwner.id})`
                : ticketOwnerId,
              inline: true,
            },
            {
              name: 'Closed By',
              value: `${interaction.user.tag} (${interaction.user.id})`,
              inline: true,
            }
          )
          .setColor(0xe74c3c)
          .setTimestamp();

        const messageOptions = { embeds: [logEmbed] };
        if (transcript) messageOptions.files = [transcript];

        await logChannel.send(messageOptions);
      }
    } catch (error) {
      console.error('Ticket log error:', error);
    }
  }

  await channel.send(
    '🔒 **Ticket closed.**\nThis channel will be deleted in 5 seconds.'
  );

  setTimeout(async () => {
    try {
      await channel.delete(`Ticket closed by ${interaction.user.tag}`);
    } catch (error) {
      console.error('Could not delete ticket:', error);
    }
  }, 5000);
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === 'ticket_specific_user') {
        const userMenu = new UserSelectMenuBuilder()
          .setCustomId('ticket_choose_specific_user')
          .setPlaceholder('Choose who should see your ticket')
          .setMinValues(1)
          .setMaxValues(1);

        return interaction.reply({
          content:
            '👤 **Choose one person who should be allowed to see your ticket.**',
          components: [new ActionRowBuilder().addComponents(userMenu)],
          ephemeral: true,
        });
      }

      if (interaction.customId === 'ticket_all_staff') {
        await interaction.deferReply({ ephemeral: true });

        const result = await createTicket({
          guild: interaction.guild,
          member: interaction.member,
          type: 'all_staff',
          allowedRoles: STAFF_ROLE_IDS,
        });

        return interaction.editReply(
          result.success
            ? `✅ Ticket created: ${result.channel}`
            : result.message
        );
      }

      if (interaction.customId === 'ticket_specific_groups') {
        const groupMenu = new StringSelectMenuBuilder()
          .setCustomId('ticket_choose_groups')
          .setPlaceholder('Choose staff groups')
          .setMinValues(1)
          .setMaxValues(4)
          .addOptions(
            {
              label: 'General Staff',
              description: 'Allow General Staff',
              value: GENERAL_STAFF_ROLE_ID,
              emoji: '🛡️',
            },
            {
              label: 'Senior Staff',
              description: 'Allow Senior Staff',
              value: SENIOR_STAFF_ROLE_ID,
              emoji: '⭐',
            },
            {
              label: 'Co-Owner',
              description: 'Allow Co-Owner',
              value: CO_OWNER_ROLE_ID,
              emoji: '👑',
            },
            {
              label: 'Owner',
              description: 'Allow Owner',
              value: OWNER_ROLE_ID,
              emoji: '👑',
            }
          );

        return interaction.reply({
          content: '👥 **Choose which staff groups can see your ticket.**',
          components: [new ActionRowBuilder().addComponents(groupMenu)],
          ephemeral: true,
        });
      }

      if (interaction.customId === 'ticket_close') {
        return closeTicket(interaction);
      }
    }

    if (interaction.isUserSelectMenu()) {
      if (interaction.customId === 'ticket_choose_specific_user') {
        await interaction.deferUpdate();

        const selectedUserId = interaction.values[0];

        if (selectedUserId === interaction.user.id) {
          return interaction.editReply({
            content: '❌ Choose someone other than yourself.',
            components: [],
          });
        }

        const selectedMember = await interaction.guild.members
          .fetch(selectedUserId)
          .catch(() => null);

        if (!selectedMember || selectedMember.user.bot) {
          return interaction.editReply({
            content: '❌ Please choose a valid server member.',
            components: [],
          });
        }

        const result = await createTicket({
          guild: interaction.guild,
          member: interaction.member,
          type: 'specific_user',
          allowedUsers: [selectedUserId],
        });

        return interaction.editReply({
          content: result.success
            ? `✅ Private ticket created with ${selectedMember}: ${result.channel}`
            : result.message,
          components: [],
        });
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'ticket_choose_groups') {
        await interaction.deferUpdate();

        const result = await createTicket({
          guild: interaction.guild,
          member: interaction.member,
          type: 'specific_groups',
          allowedRoles: interaction.values,
        });

        return interaction.editReply({
          content: result.success
            ? `✅ Private ticket created: ${result.channel}`
            : result.message,
          components: [],
        });
      }
    }
  } catch (error) {
    console.error('Interaction error:', error);

    const message = '❌ Something went wrong while processing that request.';

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Logged in as ${readyClient.user.tag}`);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    console.log(`✅ Connected to ${guild.name}`);
    await createSupportPanel(guild);
  } catch (error) {
    console.error('❌ Startup error:', error);
  }
});

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is missing from environment variables.');
  process.exit(1);
}

client.login(DISCORD_TOKEN);
