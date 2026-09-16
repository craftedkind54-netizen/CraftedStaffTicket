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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  Events,
} = require('discord.js');

const fs = require('fs');
const path = require('path');

// =====================================================
// CRAFTED SMP PRIVATE SUPPORT BOT
// =====================================================
//
// IMPORTANT PRIVACY DESIGN:
//
// Discord server owners can always view Discord channels.
// Because of that, private ticket conversations are NOT
// posted as normal messages inside ticket channels.
//
// Players and authorized staff communicate through:
// - Send Message
// - View Conversation
//
// Messages are stored by the bot.
//
// When the ticket is closed, the full conversation is
// sent to the closed-ticket log.
//
// =====================================================

// Railway variable:
// DISCORD_TOKEN = your Discord bot token

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// =====================================================
// SERVER SETTINGS
// =====================================================

const GUILD_ID = '1543363950262100118';

const SUPPORT_PANEL_CHANNEL_ID =
  '1543375387088781483';

const TICKET_CATEGORY_ID =
  '1548760763655520336';

const CLOSED_TICKET_LOG_CHANNEL_ID =
  '1548792161334726787';

// =====================================================
// STAFF ROLES
// =====================================================

const GENERAL_STAFF_ROLE_ID =
  '1543373922668388482';

const SENIOR_STAFF_ROLE_ID =
  '1543367669385011302';

const OWNER_ROLE_ID =
  '1546564866045902978';

const CO_OWNER_ROLE_ID =
  '1548519417992974356';

const STAFF_ROLE_IDS = [
  GENERAL_STAFF_ROLE_ID,
  SENIOR_STAFF_ROLE_ID,
  OWNER_ROLE_ID,
  CO_OWNER_ROLE_ID,
];

// =====================================================
// STORAGE
// =====================================================

const DATA_FOLDER =
  path.join(__dirname, 'data');

const TICKETS_FILE =
  path.join(DATA_FOLDER, 'private-tickets.json');

if (!fs.existsSync(DATA_FOLDER)) {
  fs.mkdirSync(DATA_FOLDER, {
    recursive: true,
  });
}

if (!fs.existsSync(TICKETS_FILE)) {
  fs.writeFileSync(
    TICKETS_FILE,
    JSON.stringify({}, null, 2),
    'utf8'
  );
}

function loadTickets() {
  try {
    return JSON.parse(
      fs.readFileSync(
        TICKETS_FILE,
        'utf8'
      )
    );
  } catch (error) {
    console.error(
      'Ticket storage read error:',
      error
    );

    return {};
  }
}

function saveTickets(tickets) {
  fs.writeFileSync(
    TICKETS_FILE,
    JSON.stringify(
      tickets,
      null,
      2
    ),
    'utf8'
  );
}

function getStoredTicket(channelId) {
  const tickets =
    loadTickets();

  return tickets[channelId] || null;
}

function saveStoredTicket(
  channelId,
  ticket
) {
  const tickets =
    loadTickets();

  tickets[channelId] =
    ticket;

  saveTickets(tickets);
}

function deleteStoredTicket(
  channelId
) {
  const tickets =
    loadTickets();

  delete tickets[channelId];

  saveTickets(tickets);
}

// =====================================================
// CLIENT
// =====================================================

const client =
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
    ],
  });

// =====================================================
// HELPERS
// =====================================================

function isStaff(member) {
  if (!member) {
    return false;
  }

  return STAFF_ROLE_IDS.some(
    (roleId) =>
      member.roles.cache.has(
        roleId
      )
  );
}

function cleanChannelName(name) {
  return name
    .toLowerCase()
    .replace(
      /[^a-z0-9-]/g,
      '-'
    )
    .replace(
      /-+/g,
      '-'
    )
    .replace(
      /^-|-$/g,
      ''
    )
    .substring(
      0,
      40
    );
}

function ticketPermissions() {
  return [
    PermissionsBitField.Flags
      .ViewChannel,

    PermissionsBitField.Flags
      .ReadMessageHistory,
  ];
}

function getStaffRoleName(
  member
) {
  if (
    member.roles.cache.has(
      OWNER_ROLE_ID
    )
  ) {
    return 'Owner';
  }

  if (
    member.roles.cache.has(
      CO_OWNER_ROLE_ID
    )
  ) {
    return 'Co-Owner';
  }

  if (
    member.roles.cache.has(
      SENIOR_STAFF_ROLE_ID
    )
  ) {
    return 'Senior Staff';
  }

  if (
    member.roles.cache.has(
      GENERAL_STAFF_ROLE_ID
    )
  ) {
    return 'General Staff';
  }

  return 'Staff';
}

// =====================================================
// AUTHORIZATION
// =====================================================

function canAccessTicket(
  member,
  ticket
) {
  if (!member || !ticket) {
    return false;
  }

  // Ticket creator
  if (
    member.id ===
    ticket.ownerId
  ) {
    return true;
  }

  // Specifically selected user
  if (
    ticket.allowedUsers.includes(
      member.id
    )
  ) {
    return true;
  }

  // Selected staff role
  for (
    const roleId
    of ticket.allowedRoles
  ) {
    if (
      member.roles.cache.has(
        roleId
      )
    ) {
      return true;
    }
  }

  return false;
}

function canCloseTicket(
  member,
  ticket
) {
  if (
    !isStaff(member)
  ) {
    return false;
  }

  return canAccessTicket(
    member,
    ticket
  );
}

// =====================================================
// GET STAFF MEMBERS
// =====================================================

async function getStaffMembers(
  guild
) {
  await guild.members.fetch();

  return guild.members.cache
    .filter(
      (member) =>
        !member.user.bot &&
        isStaff(member)
    )
    .map(
      (member) =>
        member
    );
}

// =====================================================
// SUPPORT PANEL
// =====================================================

async function createSupportPanel(
  guild
) {
  const channel =
    await guild.channels.fetch(
      SUPPORT_PANEL_CHANNEL_ID
    );

  if (!channel) {
    throw new Error(
      'Support panel channel not found.'
    );
  }

  const messages =
    await channel.messages.fetch({
      limit: 50,
    });

  const existingPanel =
    messages.find(
      (message) =>
        message.author.id ===
          client.user.id &&
        message.embeds[0]?.title ===
          '🎫 Crafted SMP Support'
    );

  if (existingPanel) {
    console.log(
      '✅ Support panel already exists.'
    );

    return;
  }

  const embed =
    new EmbedBuilder()
      .setTitle(
        '🎫 Crafted SMP Support'
      )
      .setDescription(
        [
          'Need support?',
          '',
          'Choose who should handle your ticket.',
          '',
          '👤 **Specific Staff Member**',
          'Choose one staff member.',
          '',
          '🛡️ **All Staff**',
          'Allow the entire staff team to handle the ticket.',
          '',
          '👥 **Specific Staff Groups**',
          'Choose which staff groups can handle the ticket.',
          '',
          '👨‍👩‍👧 **Multiple Staff Members**',
          'Choose multiple specific staff members.',
          '',
          '🔐 **Private Conversation System**',
          'Your support messages are handled privately through the bot.',
          '',
          'The complete conversation is archived when the ticket is closed.',
        ].join('\n')
      )
      .setColor(
        0x3498db
      )
      .setFooter({
        text:
          'Crafted SMP Support System',
      });

  const buttons =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            'ticket_specific_staff'
          )
          .setLabel(
            'Specific Staff'
          )
          .setEmoji('👤')
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            'ticket_all_staff'
          )
          .setLabel(
            'All Staff'
          )
          .setEmoji('🛡️')
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            'ticket_staff_groups'
          )
          .setLabel(
            'Staff Groups'
          )
          .setEmoji('👥')
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            'ticket_multiple_staff'
          )
          .setLabel(
            'Multiple Staff'
          )
          .setEmoji('👨‍👩‍👧')
          .setStyle(
            ButtonStyle.Secondary
          )
      );

  await channel.send({
    embeds: [
      embed,
    ],

    components: [
      buttons,
    ],
  });

  console.log(
    '✅ Support panel created.'
  );
}

// =====================================================
// STAFF SELECT MENUS
// =====================================================

async function showSpecificStaffMenu(
  interaction
) {
  await interaction.deferReply({
    ephemeral: true,
  });

  const staffMembers =
    await getStaffMembers(
      interaction.guild
    );

  if (
    staffMembers.length === 0
  ) {
    return interaction.editReply({
      content:
        '❌ No staff members could be found.',
    });
  }

  const visibleStaff =
    staffMembers.slice(
      0,
      25
    );

  const options =
    visibleStaff.map(
      (member) => ({
        label:
          member.displayName.substring(
            0,
            100
          ),

        description:
          getStaffRoleName(
            member
          ),

        value:
          member.id,
      })
    );

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        'ticket_specific_staff_select'
      )
      .setPlaceholder(
        'Choose a staff member'
      )
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        options
      );

  return interaction.editReply({
    content:
      '👤 **Choose a staff member:**',

    components: [
      new ActionRowBuilder()
        .addComponents(
          menu
        ),
    ],
  });
}

async function showMultipleStaffMenu(
  interaction
) {
  await interaction.deferReply({
    ephemeral: true,
  });

  const staffMembers =
    await getStaffMembers(
      interaction.guild
    );

  if (
    staffMembers.length < 2
  ) {
    return interaction.editReply({
      content:
        '❌ At least 2 staff members are required.',
    });
  }

  const visibleStaff =
    staffMembers.slice(
      0,
      25
    );

  const options =
    visibleStaff.map(
      (member) => ({
        label:
          member.displayName.substring(
            0,
            100
          ),

        description:
          getStaffRoleName(
            member
          ),

        value:
          member.id,
      })
    );

  const maxChoices =
    Math.min(
      10,
      visibleStaff.length
    );

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        'ticket_multiple_staff_select'
      )
      .setPlaceholder(
        'Choose multiple staff members'
      )
      .setMinValues(2)
      .setMaxValues(
        maxChoices
      )
      .addOptions(
        options
      );

  return interaction.editReply({
    content:
      '👨‍👩‍👧 **Choose multiple staff members:**',

    components: [
      new ActionRowBuilder()
        .addComponents(
          menu
        ),
    ],
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

  const tickets =
    loadTickets();

  const existingTicketId =
    Object.keys(
      tickets
    ).find(
      (channelId) =>
        tickets[channelId]
          .ownerId ===
        member.id
    );

  if (existingTicketId) {
    const existingChannel =
      guild.channels.cache.get(
        existingTicketId
      );

    if (existingChannel) {
      return {
        success: false,

        message:
          `❌ You already have an open ticket: ${existingChannel}`,
      };
    }

    deleteStoredTicket(
      existingTicketId
    );
  }

  // ===================================================
  // CHANNEL PERMISSIONS
  // ===================================================

  const overwrites = [
    {
      id:
        guild.roles.everyone.id,

      deny: [
        PermissionsBitField.Flags
          .ViewChannel,
      ],
    },

    {
      id:
        member.id,

      allow:
        ticketPermissions(),

      deny: [
        PermissionsBitField.Flags
          .SendMessages,
      ],
    },

    {
      id:
        client.user.id,

      allow: [
        PermissionsBitField.Flags
          .ViewChannel,

        PermissionsBitField.Flags
          .SendMessages,

        PermissionsBitField.Flags
          .ReadMessageHistory,

        PermissionsBitField.Flags
          .ManageChannels,

        PermissionsBitField.Flags
          .ManageMessages,

        PermissionsBitField.Flags
          .EmbedLinks,

        PermissionsBitField.Flags
          .AttachFiles,
      ],
    },
  ];

  // Staff roles
  for (
    const roleId
    of STAFF_ROLE_IDS
  ) {

    if (
      allowedRoles.includes(
        roleId
      )
    ) {
      overwrites.push({
        id:
          roleId,

        allow:
          ticketPermissions(),

        deny: [
          PermissionsBitField.Flags
            .SendMessages,
        ],
      });
    } else {
      overwrites.push({
        id:
          roleId,

        deny: [
          PermissionsBitField.Flags
            .ViewChannel,

          PermissionsBitField.Flags
            .SendMessages,
        ],
      });
    }
  }

  // Specifically selected staff
  for (
    const userId
    of allowedUsers
  ) {
    overwrites.push({
      id:
        userId,

      allow:
        ticketPermissions(),

      deny: [
        PermissionsBitField.Flags
          .SendMessages,
      ],
    });
  }

  const username =
    cleanChannelName(
      member.user.username
    ) || 'player';

  const ticketChannel =
    await guild.channels.create({
      name:
        `ticket-${username}-${member.id.slice(-4)}`,

      type:
        ChannelType.GuildText,

      parent:
        TICKET_CATEGORY_ID,

      topic:
        `CRAFTED_PRIVATE_SUPPORT|owner=${member.id}|type=${type}`,

      permissionOverwrites:
        overwrites,
    });

  // ===================================================
  // SAVE PRIVATE TICKET
  // ===================================================

  const ticketData = {
    channelId:
      ticketChannel.id,

    ownerId:
      member.id,

    ownerUsername:
      member.user.username,

    type:
      type,

    allowedUsers:
      allowedUsers,

    allowedRoles:
      allowedRoles,

    createdAt:
      Date.now(),

    messages:
      [],
  };

  saveStoredTicket(
    ticketChannel.id,
    ticketData
  );

  // ===================================================
  // CHANNEL INTERFACE
  // ===================================================

  const embed =
    new EmbedBuilder()
      .setTitle(
        '🔐 Private Support Ticket'
      )
      .setDescription(
        [
          `Welcome ${member}!`,
          '',
          'Your support conversation uses the private bot system.',
          '',
          '💬 **Send Message**',
          'Send a private message into the ticket.',
          '',
          '📖 **View Conversation**',
          'Privately view the conversation.',
          '',
          '🔒 **Close Ticket**',
          'Authorized staff can close and archive the ticket.',
          '',
          '⚠️ Do not type support information directly into this channel.',
        ].join('\n')
      )
      .setColor(
        0x2ecc71
      )
      .setFooter({
        text:
          'Crafted SMP Private Support',
      });

  const buttons =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            'ticket_send_message'
          )
          .setLabel(
            'Send Message'
          )
          .setEmoji('💬')
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            'ticket_view_conversation'
          )
          .setLabel(
            'View Conversation'
          )
          .setEmoji('📖')
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            'ticket_close'
          )
          .setLabel(
            'Close Ticket'
          )
          .setEmoji('🔒')
          .setStyle(
            ButtonStyle.Danger
          )
      );

  await ticketChannel.send({
    content:
      `${member}`,

    embeds: [
      embed,
    ],

    components: [
      buttons,
    ],
  });

  return {
    success: true,
    channel:
      ticketChannel,
  };
}

// =====================================================
// SEND MESSAGE MODAL
// =====================================================

async function showSendMessageModal(
  interaction
) {
  const ticket =
    getStoredTicket(
      interaction.channel.id
    );

  if (!ticket) {
    return interaction.reply({
      content:
        '❌ Private ticket data could not be found.',

      ephemeral:
        true,
    });
  }

  if (
    !canAccessTicket(
      interaction.member,
      ticket
    )
  ) {
    return interaction.reply({
      content:
        '❌ You are not authorized to participate in this ticket.',

      ephemeral:
        true,
    });
  }

  const modal =
    new ModalBuilder()
      .setCustomId(
        `ticket_message_modal:${interaction.channel.id}`
      )
      .setTitle(
        'Private Support Message'
      );

  const messageInput =
    new TextInputBuilder()
      .setCustomId(
        'support_message'
      )
      .setLabel(
        'Your message'
      )
      .setPlaceholder(
        'Type your support message here...'
      )
      .setStyle(
        TextInputStyle.Paragraph
      )
      .setRequired(
        true
      )
      .setMinLength(
        1
      )
      .setMaxLength(
        4000
      );

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(
        messageInput
      )
  );

  return interaction.showModal(
    modal
  );
}

// =====================================================
// SAVE PRIVATE MESSAGE
// =====================================================

async function savePrivateMessage(
  interaction
) {
  const channelId =
    interaction.customId.split(
      ':'
    )[1];

  const ticket =
    getStoredTicket(
      channelId
    );

  if (!ticket) {
    return interaction.reply({
      content:
        '❌ This ticket no longer exists.',

      ephemeral:
        true,
    });
  }

  if (
    !canAccessTicket(
      interaction.member,
      ticket
    )
  ) {
    return interaction.reply({
      content:
        '❌ You are not authorized to send messages in this ticket.',

      ephemeral:
        true,
    });
  }

  const message =
    interaction.fields
      .getTextInputValue(
        'support_message'
      )
      .trim();

  if (!message) {
    return interaction.reply({
      content:
        '❌ Your message cannot be empty.',

      ephemeral:
        true,
    });
  }

  ticket.messages.push({
    authorId:
      interaction.user.id,

    authorUsername:
      interaction.user.username,

    authorDisplayName:
      interaction.member.displayName,

    isStaff:
      isStaff(
        interaction.member
      ),

    content:
      message,

    timestamp:
      Date.now(),
  });

  saveStoredTicket(
    channelId,
    ticket
  );

  return interaction.reply({
    content:
      [
        '✅ **Private message sent.**',
        '',
        'Your message was added to the support conversation.',
        '',
        'It was not posted as a normal message in the ticket channel.',
      ].join('\n'),

    ephemeral:
      true,
  });
}

// =====================================================
// FORMAT CONVERSATION
// =====================================================

function formatConversation(
  ticket
) {
  if (
    !ticket.messages ||
    ticket.messages.length === 0
  ) {
    return (
      '📭 **No private messages have been sent yet.**'
    );
  }

  const messages =
    ticket.messages.slice(
      -15
    );

  const lines = [];

  for (
    const message
    of messages
  ) {
    const date =
      new Date(
        message.timestamp
      );

    const discordTimestamp =
      Math.floor(
        date.getTime() /
        1000
      );

    const role =
      message.isStaff
        ? '🛡️ STAFF'
        : '👤 PLAYER';

    lines.push(
      `${role} — **${message.authorDisplayName || message.authorUsername}**`
    );

    lines.push(
      `<t:${discordTimestamp}:f>`
    );

    lines.push(
      message.content
    );

    lines.push(
      ''
    );

    lines.push(
      '──────────────'
    );

    lines.push(
      ''
    );
  }

  let output =
    lines.join('\n');

  if (
    output.length >
    3900
  ) {
    output =
      output.slice(
        output.length -
        3900
      );

    output =
      '...\n' +
      output;
  }

  return output;
}

// =====================================================
// VIEW CONVERSATION
// =====================================================

async function viewConversation(
  interaction
) {
  const ticket =
    getStoredTicket(
      interaction.channel.id
    );

  if (!ticket) {
    return interaction.reply({
      content:
        '❌ Private ticket data could not be found.',

      ephemeral:
        true,
    });
  }

  if (
    !canAccessTicket(
      interaction.member,
      ticket
    )
  ) {
    return interaction.reply({
      content:
        '❌ You are not authorized to view this conversation.',

      ephemeral:
        true,
    });
  }

  const conversation =
    formatConversation(
      ticket
    );

  const embed =
    new EmbedBuilder()
      .setTitle(
        '🔐 Private Conversation'
      )
      .setDescription(
        conversation
      )
      .setColor(
        0x3498db
      )
      .setFooter({
        text:
          `Showing the most recent ${Math.min(ticket.messages.length, 15)} messages`,
      });

  return interaction.reply({
    embeds: [
      embed,
    ],

    ephemeral:
      true,
  });
}

// =====================================================
// CREATE FINAL TRANSCRIPT
// =====================================================

function createPrivateTranscript(
  ticket,
  channel
) {
  const lines = [];

  lines.push(
    '=================================================='
  );

  lines.push(
    'CRAFTED SMP PRIVATE SUPPORT TICKET'
  );

  lines.push(
    'FULL CONVERSATION HISTORY'
  );

  lines.push(
    '=================================================='
  );

  lines.push('');

  lines.push(
    `Ticket: #${channel.name}`
  );

  lines.push(
    `Channel ID: ${channel.id}`
  );

  lines.push(
    `Created By: ${ticket.ownerUsername}`
  );

  lines.push(
    `Creator ID: ${ticket.ownerId}`
  );

  lines.push(
    `Ticket Type: ${ticket.type}`
  );

  lines.push(
    `Created: ${new Date(ticket.createdAt).toLocaleString()}`
  );

  lines.push('');

  lines.push(
    '=================================================='
  );

  lines.push('');

  if (
    ticket.messages.length === 0
  ) {
    lines.push(
      '[No private messages were sent.]'
    );
  }

  for (
    const message
    of ticket.messages
  ) {
    const date =
      new Date(
        message.timestamp
      ).toLocaleString();

    lines.push(
      `[${date}]`
    );

    lines.push(
      `${message.isStaff ? '[STAFF]' : '[PLAYER]'} ${message.authorDisplayName || message.authorUsername}`
    );

    lines.push(
      `User ID: ${message.authorId}`
    );

    lines.push('');

    lines.push(
      message.content
    );

    lines.push('');

    lines.push(
      '--------------------------------------------------'
    );

    lines.push('');
  }

  const buffer =
    Buffer.from(
      lines.join('\n'),
      'utf8'
    );

  return new AttachmentBuilder(
    buffer,
    {
      name:
        `${channel.name}-private-conversation.txt`,
    }
  );
}

// =====================================================
// CLOSE TICKET
// =====================================================

async function closeTicket(
  interaction
) {
  const channel =
    interaction.channel;

  const ticket =
    getStoredTicket(
      channel.id
    );

  if (!ticket) {
    return interaction.reply({
      content:
        '❌ Private ticket data could not be found.',

      ephemeral:
        true,
    });
  }

  if (
    !canCloseTicket(
      interaction.member,
      ticket
    )
  ) {
    return interaction.reply({
      content:
        '❌ Only authorized staff members can close this ticket.',

      ephemeral:
        true,
    });
  }

  await interaction.reply({
    content:
      '🔒 Archiving the private conversation...',

    ephemeral:
      true,
  });

  try {

    const archiveChannel =
      await interaction.guild.channels.fetch(
        CLOSED_TICKET_LOG_CHANNEL_ID
      );

    if (!archiveChannel) {
      throw new Error(
        'Closed ticket archive channel not found.'
      );
    }

    const transcript =
      createPrivateTranscript(
        ticket,
        channel
      );

    const ticketOwner =
      await interaction.guild.members
        .fetch(
          ticket.ownerId
        )
        .catch(
          () => null
        );

    const archiveEmbed =
      new EmbedBuilder()
        .setTitle(
          '🔒 Closed Private Support Ticket'
        )
        .setDescription(
          [
            'This support ticket has been closed.',
            '',
            '📎 The complete private conversation is attached.',
            '',
            'The conversation was stored privately until the ticket was closed.',
          ].join('\n')
        )
        .addFields(

          {
            name:
              '🎫 Ticket',

            value:
              `#${channel.name}`,

            inline:
              true,
          },

          {
            name:
              '👤 Created By',

            value:
              ticketOwner
                ? `${ticketOwner.user.tag}\n<@${ticketOwner.id}>`
                : `<@${ticket.ownerId}>`,

            inline:
              true,
          },

          {
            name:
              '🔒 Closed By',

            value:
              `${interaction.user.tag}\n<@${interaction.user.id}>`,

            inline:
              true,
          },

          {
            name:
              '📂 Ticket Type',

            value:
              ticket.type,

            inline:
              true,
          },

          {
            name:
              '💬 Messages',

            value:
              `${ticket.messages.length}`,

            inline:
              true,
          },

          {
            name:
              '🆔 Channel ID',

            value:
              channel.id,

            inline:
              true,
          }
        )
        .setColor(
          0xe74c3c
        )
        .setTimestamp();

    // IMPORTANT:
    // Archive BEFORE deleting private data.

    await archiveChannel.send({
      embeds: [
        archiveEmbed,
      ],

      files: [
        transcript,
      ],
    });

    // Only delete stored conversation after
    // archive succeeds.

    deleteStoredTicket(
      channel.id
    );

    await channel.send({
      content:
        [
          '✅ **Ticket archived successfully.**',
          '',
          'The complete conversation has been saved.',
          '',
          '🔒 This ticket will be deleted in 5 seconds.',
        ].join('\n'),
    });

    setTimeout(
      async () => {
        try {
          await channel.delete(
            `Closed by ${interaction.user.tag}`
          );
        } catch (error) {
          console.error(
            'Ticket delete error:',
            error
          );
        }
      },
      5000
    );

  } catch (error) {

    console.error(
      'Ticket archive error:',
      error
    );

    await interaction.followUp({
      content:
        [
          '❌ **The ticket could not be archived.**',
          '',
          'The ticket was NOT deleted.',
          '',
          'The private conversation was NOT deleted.',
          '',
          'This prevents the conversation from being lost.',
        ].join('\n'),

      ephemeral:
        true,
    });
  }
}

// =====================================================
// INTERACTIONS
// =====================================================

client.on(
  Events.InteractionCreate,

  async (interaction) => {

    try {

      // =================================================
      // BUTTONS
      // =================================================

      if (
        interaction.isButton()
      ) {

        // -----------------------------------------------
        // SPECIFIC STAFF
        // -----------------------------------------------

        if (
          interaction.customId ===
          'ticket_specific_staff'
        ) {
          return showSpecificStaffMenu(
            interaction
          );
        }

        // -----------------------------------------------
        // ALL STAFF
        // -----------------------------------------------

        if (
          interaction.customId ===
          'ticket_all_staff'
        ) {

          await interaction.deferReply({
            ephemeral:
              true,
          });

          const result =
            await createTicket({
              guild:
                interaction.guild,

              member:
                interaction.member,

              type:
                'all_staff',

              allowedRoles:
                STAFF_ROLE_IDS,
            });

          return interaction.editReply({
            content:
              result.success
                ? `✅ Private ticket created: ${result.channel}`
                : result.message,
          });
        }

        // -----------------------------------------------
        // STAFF GROUPS
        // -----------------------------------------------

        if (
          interaction.customId ===
          'ticket_staff_groups'
        ) {

          const menu =
            new StringSelectMenuBuilder()
              .setCustomId(
                'ticket_staff_groups_select'
              )
              .setPlaceholder(
                'Choose staff groups'
              )
              .setMinValues(1)
              .setMaxValues(4)
              .addOptions(

                {
                  label:
                    'General Staff',

                  value:
                    GENERAL_STAFF_ROLE_ID,

                  emoji:
                    '🛡️',
                },

                {
                  label:
                    'Senior Staff',

                  value:
                    SENIOR_STAFF_ROLE_ID,

                  emoji:
                    '⭐',
                },

                {
                  label:
                    'Co-Owner',

                  value:
                    CO_OWNER_ROLE_ID,

                  emoji:
                    '👑',
                },

                {
                  label:
                    'Owner',

                  value:
                    OWNER_ROLE_ID,

                  emoji:
                    '👑',
                }
              );

          return interaction.reply({
            content:
              '👥 Choose which staff groups should handle the ticket.',

            components: [
              new ActionRowBuilder()
                .addComponents(
                  menu
                ),
            ],

            ephemeral:
              true,
          });
        }

        // -----------------------------------------------
        // MULTIPLE STAFF
        // -----------------------------------------------

        if (
          interaction.customId ===
          'ticket_multiple_staff'
        ) {
          return showMultipleStaffMenu(
            interaction
          );
        }

        // -----------------------------------------------
        // SEND MESSAGE
        // -----------------------------------------------

        if (
          interaction.customId ===
          'ticket_send_message'
        ) {
          return showSendMessageModal(
            interaction
          );
        }

        // -----------------------------------------------
        // VIEW CONVERSATION
        // -----------------------------------------------

        if (
          interaction.customId ===
          'ticket_view_conversation'
        ) {
          return viewConversation(
            interaction
          );
        }

        // -----------------------------------------------
        // CLOSE TICKET
        // -----------------------------------------------

        if (
          interaction.customId ===
          'ticket_close'
        ) {
          return closeTicket(
            interaction
          );
        }
      }

      // =================================================
      // SPECIFIC STAFF SELECT
      // =================================================

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          'ticket_specific_staff_select'
      ) {

        await interaction.deferUpdate();

        const selectedStaffId =
          interaction.values[0];

        const selectedStaff =
          await interaction.guild.members
            .fetch(
              selectedStaffId
            )
            .catch(
              () => null
            );

        if (
          !selectedStaff ||
          selectedStaff.user.bot ||
          !isStaff(
            selectedStaff
          )
        ) {
          return interaction.editReply({
            content:
              '❌ That user is no longer a valid staff member.',

            components:
              [],
          });
        }

        const result =
          await createTicket({
            guild:
              interaction.guild,

            member:
              interaction.member,

            type:
              'specific_staff',

            allowedUsers: [
              selectedStaffId,
            ],
          });

        return interaction.editReply({
          content:
            result.success
              ? `✅ Private ticket created with ${selectedStaff}: ${result.channel}`
              : result.message,

          components:
            [],
        });
      }

      // =================================================
      // MULTIPLE STAFF SELECT
      // =================================================

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          'ticket_multiple_staff_select'
      ) {

        await interaction.deferUpdate();

        const selectedStaffIds =
          interaction.values;

        const validStaffIds =
          [];

        for (
          const staffId
          of selectedStaffIds
        ) {

          const member =
            await interaction.guild.members
              .fetch(
                staffId
              )
              .catch(
                () => null
              );

          if (
            member &&
            !member.user.bot &&
            isStaff(member)
          ) {
            validStaffIds.push(
              staffId
            );
          }
        }

        if (
          validStaffIds.length < 2
        ) {
          return interaction.editReply({
            content:
              '❌ Choose at least 2 valid staff members.',

            components:
              [],
          });
        }

        const result =
          await createTicket({
            guild:
              interaction.guild,

            member:
              interaction.member,

            type:
              'multiple_staff',

            allowedUsers:
              validStaffIds,
          });

        return interaction.editReply({
          content:
            result.success
              ? `✅ Private ticket created with ${validStaffIds.length} staff members: ${result.channel}`
              : result.message,

          components:
            [],
        });
      }

      // =================================================
      // STAFF GROUP SELECT
      // =================================================

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          'ticket_staff_groups_select'
      ) {

        await interaction.deferUpdate();

        const result =
          await createTicket({
            guild:
              interaction.guild,

            member:
              interaction.member,

            type:
              'staff_groups',

            allowedRoles:
              interaction.values,
          });

        return interaction.editReply({
          content:
            result.success
              ? `✅ Private ticket created: ${result.channel}`
              : result.message,

          components:
            [],
        });
      }

      // =================================================
      // PRIVATE MESSAGE MODAL
      // =================================================

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(
          'ticket_message_modal:'
        )
      ) {
        return savePrivateMessage(
          interaction
        );
      }

    } catch (error) {

      console.error(
        'Interaction error:',
        error
      );

      const message =
        '❌ Something went wrong. Please try again.';

      if (
        interaction.deferred ||
        interaction.replied
      ) {
        await interaction
          .followUp({
            content:
              message,

            ephemeral:
              true,
          })
          .catch(
            () => {}
          );

      } else {

        await interaction
          .reply({
            content:
              message,

            ephemeral:
              true,
          })
          .catch(
            () => {}
          );
      }
    }
  }
);

// =====================================================
// READY
// =====================================================

client.once(
  Events.ClientReady,

  async (
    readyClient
  ) => {

    console.log(
      `✅ Logged in as ${readyClient.user.tag}`
    );

    try {

      const guild =
        await client.guilds.fetch(
          GUILD_ID
        );

      await guild.members.fetch();

      console.log(
        `✅ Connected to ${guild.name}`
      );

      const staff =
        guild.members.cache.filter(
          (member) =>
            !member.user.bot &&
            isStaff(member)
        );

      console.log(
        `✅ Found ${staff.size} staff members`
      );

      await createSupportPanel(
        guild
      );

      const archiveChannel =
        await guild.channels.fetch(
          CLOSED_TICKET_LOG_CHANNEL_ID
        );

      console.log(
        `✅ Closed ticket archive: #${archiveChannel.name}`
      );

      console.log(
        '🔐 Private ticket storage ready.'
      );

    } catch (error) {

      console.error(
        '❌ Startup error:',
        error
      );
    }
  }
);

// =====================================================
// ERRORS
// =====================================================

process.on(
  'unhandledRejection',

  (error) => {
    console.error(
      'Unhandled rejection:',
      error
    );
  }
);

process.on(
  'uncaughtException',

  (error) => {
    console.error(
      'Uncaught exception:',
      error
    );
  }
);

// =====================================================
// LOGIN
// =====================================================

if (!DISCORD_TOKEN) {

  console.error(
    '❌ DISCORD_TOKEN is missing.'
  );

  process.exit(1);
}

client.login(
  DISCORD_TOKEN
);
