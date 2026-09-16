const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  Events,
} = require('discord.js');

// =====================================================
// CRAFTED SMP SUPPORT BOT
// OWNER PRIVACY INDICATOR VERSION
// =====================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// =====================================================
// SERVER SETTINGS
// =====================================================

const GUILD_ID = '1543363950262100118';
const SUPPORT_PANEL_CHANNEL_ID = '1543375387088781483';
const TICKET_CATEGORY_ID = '1548760763655520336';
const CLOSED_TICKET_LOG_CHANNEL_ID = '1548792161334726787';

// =====================================================
// STAFF ROLES
// =====================================================

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

// =====================================================
// CLIENT
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// =====================================================
// HELPERS
// =====================================================

function isStaff(member) {
  if (!member) return false;
  return STAFF_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
}

function cleanChannelName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 35);
}

function getTicketOwner(channel) {
  if (!channel.topic) return null;
  const match = channel.topic.match(/owner=(\d+)/);
  return match ? match[1] : null;
}

function getTicketType(channel) {
  if (!channel.topic) return 'unknown';
  const match = channel.topic.match(/type=([^|]+)/);
  return match ? match[1] : 'unknown';
}

function getAllowedUsers(channel) {
  if (!channel.topic) return [];
  const match = channel.topic.match(/users=([^|]*)/);
  if (!match || !match[1]) return [];
  return match[1].split(',').filter(Boolean);
}

function getAllowedRoles(channel) {
  if (!channel.topic) return [];
  const match = channel.topic.match(/roles=([^|]*)/);
  if (!match || !match[1]) return [];
  return match[1].split(',').filter(Boolean);
}

function ticketPermissions() {
  return [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ReadMessageHistory,
    PermissionsBitField.Flags.AttachFiles,
    PermissionsBitField.Flags.EmbedLinks,
  ];
}

function getStaffRoleName(member) {
  if (member.roles.cache.has(OWNER_ROLE_ID)) return 'Owner';
  if (member.roles.cache.has(CO_OWNER_ROLE_ID)) return 'Co-Owner';
  if (member.roles.cache.has(SENIOR_STAFF_ROLE_ID)) return 'Senior Staff';
  if (member.roles.cache.has(GENERAL_STAFF_ROLE_ID)) return 'General Staff';
  return 'Staff';
}

// =====================================================
// SUPPORT PANEL
// =====================================================

async function createSupportPanel(guild) {
  const channel = await guild.channels.fetch(SUPPORT_PANEL_CHANNEL_ID);
  if (!channel) throw new Error('Support panel channel not found.');

  const messages = await channel.messages.fetch({ limit: 50 });
  const existingPanel = messages.find(
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
    .setDescription([
      'Need support?',
      '',
      'Choose who you want to handle your ticket.',
      '',
      '👤 **Specific Staff Member**',
      'Choose one staff member.',
      '',
      '🛡️ **All Staff**',
      'Allow the entire staff team to see the ticket.',
      '',
      '👥 **Specific Staff Groups**',
      'Choose which staff groups can see the ticket.',
      '',
      '👨‍👩‍👧 **Multiple Staff Members**',
      'Choose multiple specific staff members.',
      '',
      '🔐 Tickets not intended for the server owner are marked PRIVATE.',
    ].join('\n'))
    .setColor(0x3498db)
    .setFooter({ text: 'Crafted SMP Support System' });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_specific_staff')
      .setLabel('Specific Staff')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ticket_all_staff')
      .setLabel('All Staff')
      .setEmoji('🛡️')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('ticket_staff_groups')
      .setLabel('Staff Groups')
      .setEmoji('👥')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ticket_multiple_staff')
      .setLabel('Multiple Staff')
      .setEmoji('👨‍👩‍👧')
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [buttons] });
  console.log('✅ Support panel created.');
}

// =====================================================
// STAFF MENUS
// =====================================================

async function getStaffMembers(guild) {
  await guild.members.fetch();
  return guild.members.cache
    .filter((member) => !member.user.bot && isStaff(member))
    .map((member) => member);
}

async function showSpecificStaffMenu(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const staffMembers = await getStaffMembers(interaction.guild);
  if (staffMembers.length === 0) {
    return interaction.editReply({ content: '❌ No staff members could be found.' });
  }

  const options = staffMembers.slice(0, 25).map((member) => ({
    label: member.displayName.substring(0, 100),
    description: getStaffRoleName(member),
    value: member.id,
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_specific_staff_select')
    .setPlaceholder('Choose a staff member')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  return interaction.editReply({
    content: '👤 **Choose a staff member:**',
    components: [new ActionRowBuilder().addComponents(menu)],
  });
}

async function showMultipleStaffMenu(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const staffMembers = await getStaffMembers(interaction.guild);
  if (staffMembers.length < 2) {
    return interaction.editReply({
      content: '❌ At least 2 staff members are required for this option.',
    });
  }

  const visibleStaff = staffMembers.slice(0, 25);
  const options = visibleStaff.map((member) => ({
    label: member.displayName.substring(0, 100),
    description: getStaffRoleName(member),
    value: member.id,
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_multiple_staff_select')
    .setPlaceholder('Choose multiple staff members')
    .setMinValues(2)
    .setMaxValues(Math.min(10, visibleStaff.length))
    .addOptions(options);

  return interaction.editReply({
    content: '👨‍👩‍👧 **Choose multiple staff members:**',
    components: [new ActionRowBuilder().addComponents(menu)],
  });
}

// =====================================================
// CREATE TICKET
// =====================================================

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
      message: `❌ You already have an open ticket: ${existingTicket}`,
    };
  }

  // Discord's actual server owner is detected automatically.
  // No separate user ID variable is needed.
  const discordOwnerId = guild.ownerId;

  // Owner is considered included ONLY when:
  // 1) they were selected specifically, OR
  // 2) the Owner role was selected, OR
  // 3) "All Staff" was selected.
  const ownerIncluded =
    allowedUsers.includes(discordOwnerId) ||
    allowedRoles.includes(OWNER_ROLE_ID) ||
    type === 'all_staff';

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: member.id,
      allow: ticketPermissions(),
    },
    {
      id: client.user.id,
      allow: [
        ...ticketPermissions(),
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
      ],
    },
  ];

  for (const roleId of STAFF_ROLE_IDS) {
    if (allowedRoles.includes(roleId)) {
      overwrites.push({
        id: roleId,
        allow: ticketPermissions(),
      });
    } else {
      overwrites.push({
        id: roleId,
        deny: [PermissionsBitField.Flags.ViewChannel],
      });
    }
  }

  for (const userId of allowedUsers) {
    overwrites.push({
      id: userId,
      allow: ticketPermissions(),
    });
  }

  // This overwrite documents the intended privacy state.
  // Discord itself does not allow permission overwrites to hide a channel
  // from the actual server owner, so this cannot technically block them.
  if (!ownerIncluded && discordOwnerId !== member.id) {
    overwrites.push({
      id: discordOwnerId,
      deny: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.AddReactions,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
        PermissionsBitField.Flags.SendMessagesInThreads,
      ],
    });
  }

  const username = cleanChannelName(member.user.username) || 'player';

  // Discord channel names cannot reliably display every emoji.
  // "private-" is used as the permanent visual warning.
  const channelPrefix = ownerIncluded ? 'ticket' : 'private-ticket';

  const topicParts = [
    'CRAFTED_SUPPORT',
    `owner=${member.id}`,
    `type=${type}`,
    `users=${allowedUsers.join(',')}`,
    `roles=${allowedRoles.join(',')}`,
    `serverOwnerIncluded=${ownerIncluded ? 'yes' : 'no'}`,
  ];

  if (!ownerIncluded) {
    topicParts.push('PRIVACY=🔐 PRIVATE - SERVER OWNER NOT INCLUDED - DO NOT OPEN');
  }

  const ticketChannel = await guild.channels.create({
    name: `${channelPrefix}-${username}-${member.id.slice(-4)}`,
    type: ChannelType.GuildText,
    parent: TICKET_CATEGORY_ID,
    topic: topicParts.join('|'),
    permissionOverwrites: overwrites,
  });

  let privacyText = 'This is a private support ticket.';

  if (type === 'specific_staff') {
    privacyText = 'Only you and the staff member you selected should participate in this ticket.';
  } else if (type === 'all_staff') {
    privacyText = 'You and all Crafted SMP staff can participate in this ticket.';
  } else if (type === 'staff_groups') {
    privacyText = 'Only you and the selected staff groups should participate in this ticket.';
  } else if (type === 'multiple_staff') {
    privacyText = 'Only you and the specific staff members you selected should participate in this ticket.';
  }

  const description = [
    `Welcome ${member}!`,
    '',
    privacyText,
    '',
    'Explain what you need help with below.',
    '',
    'A staff member can close this ticket when it is resolved.',
  ];

  if (!ownerIncluded) {
    description.push(
      '',
      '🔐 **PRIVATE — SERVER OWNER NOT INCLUDED**',
      'The server owner was not selected for this conversation.',
      '**OWNER: DO NOT OPEN OR PARTICIPATE IN THIS TICKET.**',
      'The completed transcript will be available in Closed Tickets after closure.'
    );
  }

  const embed = new EmbedBuilder()
    .setTitle(ownerIncluded ? '🎫 Support Ticket' : '🔐 PRIVATE Support Ticket')
    .setDescription(description.join('\n'))
    .setColor(ownerIncluded ? 0x2ecc71 : 0x95a5a6)
    .setFooter({
      text: ownerIncluded
        ? `Ticket opened by ${member.user.username}`
        : '🔐 PRIVATE — Server owner not included',
    });

  const closeButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );

  // Only ping the ticket creator.
  // The server owner receives no bot mention when not included.
  await ticketChannel.send({
    content: `${member}`,
    embeds: [embed],
    components: [closeButton],
    allowedMentions: {
      users: [member.id],
      roles: [],
    },
  });

  return {
    success: true,
    channel: ticketChannel,
    ownerIncluded,
  };
}

// =====================================================
// TRANSCRIPT
// =====================================================

async function createTranscript(channel) {
  let allMessages = [];
  let before;

  while (true) {
    const options = { limit: 100 };
    if (before) options.before = before;

    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;

    allMessages.push(...messages.values());
    before = messages.last().id;

    if (messages.size < 100) break;
  }

  allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const lines = [
    '==================================================',
    'CRAFTED SMP SUPPORT TICKET',
    'FULL CONVERSATION HISTORY',
    '==================================================',
    '',
    `Ticket: #${channel.name}`,
    `Channel ID: ${channel.id}`,
    `Created: ${new Date(channel.createdTimestamp).toLocaleString()}`,
    '',
    '==================================================',
    '',
  ];

  for (const message of allMessages) {
    const date = new Date(message.createdTimestamp).toLocaleString();

    lines.push(`[${date}]`);
    lines.push(`${message.author.tag} (${message.author.id})`);
    lines.push('');
    lines.push(message.content || '[No text content]');

    if (message.attachments.size > 0) {
      lines.push('', 'ATTACHMENTS:');
      for (const attachment of message.attachments.values()) {
        lines.push(`Name: ${attachment.name || 'Attachment'}`);
        lines.push(`URL: ${attachment.url}`);
      }
    }

    if (message.embeds.length > 0) {
      lines.push('', `Discord embeds: ${message.embeds.length}`);
    }

    lines.push('', '--------------------------------------------------', '');
  }

  return new AttachmentBuilder(
    Buffer.from(lines.join('\n'), 'utf8'),
    { name: `${channel.name}-conversation-history.txt` }
  );
}

// =====================================================
// CLOSE TICKET
// =====================================================

async function closeTicket(interaction) {
  const channel = interaction.channel;
  const ticketOwnerId = getTicketOwner(channel);

  if (!ticketOwnerId) {
    return interaction.reply({
      content: '❌ This is not a support ticket.',
      ephemeral: true,
    });
  }

  if (!isStaff(interaction.member)) {
    return interaction.reply({
      content: '❌ Only staff members can close tickets.',
      ephemeral: true,
    });
  }

  // If the actual server owner was not included, do not allow them
  // to operate the Close Ticket button either.
  const discordOwnerId = interaction.guild.ownerId;
  const ownerIncluded =
    channel.topic?.includes('serverOwnerIncluded=yes') ?? false;

  if (interaction.user.id === discordOwnerId && !ownerIncluded) {
    return interaction.reply({
      content: '🔐 You were not included in this private ticket. Please leave it for the selected staff to close.',
      ephemeral: true,
    });
  }

  const allowedUsers = getAllowedUsers(channel);
  const allowedRoles = getAllowedRoles(channel);

  const specificallyAllowed = allowedUsers.includes(interaction.user.id);
  const roleAllowed = allowedRoles.some((roleId) =>
    interaction.member.roles.cache.has(roleId)
  );

  // For selected/private tickets, only included staff can close.
  // The ticket creator cannot close because close remains staff-only.
  if (
    getTicketType(channel) !== 'all_staff' &&
    !specificallyAllowed &&
    !roleAllowed
  ) {
    return interaction.reply({
      content: '❌ You were not selected for this ticket.',
      ephemeral: true,
    });
  }

  await interaction.reply({
    content: '🔒 Saving the ticket conversation...',
    ephemeral: true,
  });

  try {
    const transcript = await createTranscript(channel);

    const archiveChannel = await interaction.guild.channels.fetch(
      CLOSED_TICKET_LOG_CHANNEL_ID
    );

    if (!archiveChannel) {
      throw new Error('Closed ticket channel not found.');
    }

    const ticketOwner = await interaction.guild.members
      .fetch(ticketOwnerId)
      .catch(() => null);

    const ticketType = getTicketType(channel);

    const archiveEmbed = new EmbedBuilder()
      .setTitle('🔒 Closed Support Ticket')
      .setDescription([
        'This ticket has been closed.',
        '',
        '📎 The full conversation history is attached.',
      ].join('\n'))
      .addFields(
        {
          name: '🎫 Ticket',
          value: `#${channel.name}`,
          inline: true,
        },
        {
          name: '👤 Created By',
          value: ticketOwner
            ? `${ticketOwner.user.tag}\n<@${ticketOwner.id}>`
            : `<@${ticketOwnerId}>`,
          inline: true,
        },
        {
          name: '🔒 Closed By',
          value: `${interaction.user.tag}\n<@${interaction.user.id}>`,
          inline: true,
        },
        {
          name: '📂 Ticket Type',
          value: ticketType,
          inline: true,
        },
        {
          name: '🆔 Channel ID',
          value: channel.id,
          inline: true,
        }
      )
      .setColor(0xe74c3c)
      .setTimestamp();

    await archiveChannel.send({
      embeds: [archiveEmbed],
      files: [transcript],
    });

    await channel.send([
      '✅ **Ticket saved successfully.**',
      '',
      'The conversation history has been archived.',
      '',
      '🔒 This ticket will be deleted in 5 seconds.',
    ].join('\n'));

    setTimeout(async () => {
      try {
        await channel.delete(`Closed by ${interaction.user.tag}`);
      } catch (error) {
        console.error('Delete error:', error);
      }
    }, 5000);
  } catch (error) {
    console.error('Archive error:', error);

    await channel.send([
      '❌ **The ticket could not be archived.**',
      '',
      'This channel will NOT be deleted.',
      '',
      'This prevents the conversation from being lost.',
    ].join('\n'));
  }
}

// =====================================================
// INTERACTIONS
// =====================================================

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === 'ticket_specific_staff') {
        return showSpecificStaffMenu(interaction);
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

      if (interaction.customId === 'ticket_staff_groups') {
        const menu = new StringSelectMenuBuilder()
          .setCustomId('ticket_staff_groups_select')
          .setPlaceholder('Choose staff groups')
          .setMinValues(1)
          .setMaxValues(4)
          .addOptions(
            {
              label: 'General Staff',
              value: GENERAL_STAFF_ROLE_ID,
              emoji: '🛡️',
            },
            {
              label: 'Senior Staff',
              value: SENIOR_STAFF_ROLE_ID,
              emoji: '⭐',
            },
            {
              label: 'Co-Owner',
              value: CO_OWNER_ROLE_ID,
              emoji: '👑',
            },
            {
              label: 'Owner',
              value: OWNER_ROLE_ID,
              emoji: '👑',
            }
          );

        return interaction.reply({
          content: '👥 Choose which staff groups can access the ticket.',
          components: [new ActionRowBuilder().addComponents(menu)],
          ephemeral: true,
        });
      }

      if (interaction.customId === 'ticket_multiple_staff') {
        return showMultipleStaffMenu(interaction);
      }

      if (interaction.customId === 'ticket_close') {
        return closeTicket(interaction);
      }
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === 'ticket_specific_staff_select'
    ) {
      await interaction.deferUpdate();

      const selectedStaffId = interaction.values[0];
      const selectedStaff = await interaction.guild.members
        .fetch(selectedStaffId)
        .catch(() => null);

      if (!selectedStaff || !isStaff(selectedStaff) || selectedStaff.user.bot) {
        return interaction.editReply({
          content: '❌ That user is no longer a valid staff member.',
          components: [],
        });
      }

      const result = await createTicket({
        guild: interaction.guild,
        member: interaction.member,
        type: 'specific_staff',
        allowedUsers: [selectedStaffId],
      });

      return interaction.editReply({
        content: result.success
          ? `✅ Private ticket created with ${selectedStaff}: ${result.channel}`
          : result.message,
        components: [],
      });
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === 'ticket_multiple_staff_select'
    ) {
      await interaction.deferUpdate();

      const validStaffIds = [];

      for (const staffId of interaction.values) {
        const member = await interaction.guild.members
          .fetch(staffId)
          .catch(() => null);

        if (member && !member.user.bot && isStaff(member)) {
          validStaffIds.push(staffId);
        }
      }

      if (validStaffIds.length < 2) {
        return interaction.editReply({
          content: '❌ You need to choose at least 2 valid staff members.',
          components: [],
        });
      }

      const result = await createTicket({
        guild: interaction.guild,
        member: interaction.member,
        type: 'multiple_staff',
        allowedUsers: validStaffIds,
      });

      return interaction.editReply({
        content: result.success
          ? `✅ Private ticket created with ${validStaffIds.length} staff members: ${result.channel}`
          : result.message,
        components: [],
      });
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === 'ticket_staff_groups_select'
    ) {
      await interaction.deferUpdate();

      const result = await createTicket({
        guild: interaction.guild,
        member: interaction.member,
        type: 'staff_groups',
        allowedRoles: interaction.values,
      });

      return interaction.editReply({
        content: result.success
          ? `✅ Private ticket created: ${result.channel}`
          : result.message,
        components: [],
      });
    }
  } catch (error) {
    console.error('Interaction error:', error);

    const message = '❌ Something went wrong. Please try again.';

    if (interaction.deferred || interaction.replied) {
      await interaction
        .followUp({ content: message, ephemeral: true })
        .catch(() => {});
    } else {
      await interaction
        .reply({ content: message, ephemeral: true })
        .catch(() => {});
    }
  }
});

// =====================================================
// READY
// =====================================================

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Logged in as ${readyClient.user.tag}`);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.members.fetch();

    console.log(`✅ Connected to ${guild.name}`);
    console.log(`✅ Discord server owner detected automatically: ${guild.ownerId}`);

    const staff = guild.members.cache.filter(
      (member) => !member.user.bot && isStaff(member)
    );

    console.log(`✅ Found ${staff.size} staff members`);

    await createSupportPanel(guild);

    const archiveChannel = await guild.channels.fetch(
      CLOSED_TICKET_LOG_CHANNEL_ID
    );

    console.log(`✅ Closed ticket archive: #${archiveChannel.name}`);
  } catch (error) {
    console.error('❌ Startup error:', error);
  }
});

// =====================================================
// ERRORS
// =====================================================

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

// =====================================================
// LOGIN
// =====================================================

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is missing.');
  process.exit(1);
}

client.login(DISCORD_TOKEN);
