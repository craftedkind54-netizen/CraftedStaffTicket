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
// CRAFTED SMP SUPPORT BOT SETTINGS
// =====================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

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
// DISCORD CLIENT
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// =====================================================
// HELPERS
// =====================================================

function cleanChannelName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
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

function isStaff(member) {
  return STAFF_ROLE_IDS.some((roleId) =>
    member.roles.cache.has(roleId)
  );
}

function baseTicketPermissions(guild, member) {
  return [
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
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
      ],
    },
  ];
}

// =====================================================
// SUPPORT PANEL
// =====================================================

async function createSupportPanel(guild) {
  const channel = await guild.channels.fetch(
    SUPPORT_PANEL_CHANNEL_ID
  );

  if (!channel) {
    throw new Error('Support panel channel not found.');
  }

  const messages = await channel.messages.fetch({
    limit: 50,
  });

  const alreadyExists = messages.find(
    (message) =>
      message.author.id === client.user.id &&
      message.embeds[0]?.title === '🎫 Crafted SMP Support'
  );

  if (alreadyExists) {
    console.log('✅ Support panel already exists.');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🎫 Crafted SMP Support')
    .setDescription(
      [
        'Need help with something?',
        '',
        'Choose who you want to share your ticket with.',
        '',
        '👤 **Specific Person**',
        'Only the person you select can access the ticket with you.',
        '',
        '🛡️ **All Staff**',
        'All Crafted SMP staff members can access the ticket.',
        '',
        '👥 **Specific Staff Groups**',
        'Choose which staff groups are allowed to access the ticket.',
        '',
        'Your support conversation will stay private until the ticket is closed.',
      ].join('\n')
    )
    .setColor(0x3498db)
    .setFooter({
      text: 'Crafted SMP Support',
    });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_specific_person')
      .setLabel('Specific Person')
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
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({
    embeds: [embed],
    components: [buttons],
  });

  console.log('✅ Support panel created.');
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
      message:
        `❌ You already have an open ticket: ${existingTicket}`,
    };
  }

  const overwrites =
    baseTicketPermissions(guild, member);

  // ===================================================
  // ADD SPECIFIC USERS
  // ===================================================

  for (const userId of allowedUsers) {
    overwrites.push({
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

  // ===================================================
  // ADD SELECTED STAFF ROLES
  // ===================================================

  for (const roleId of allowedRoles) {
    overwrites.push({
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

  // ===================================================
  // DENY STAFF ROLES NOT SELECTED
  // ===================================================

  if (type !== 'all_staff') {
    for (const roleId of STAFF_ROLE_IDS) {
      if (!allowedRoles.includes(roleId)) {
        overwrites.push({
          id: roleId,
          deny: [
            PermissionsBitField.Flags.ViewChannel,
          ],
        });
      }
    }
  }

  const safeName =
    cleanChannelName(member.user.username) ||
    'player';

  const ticketChannel =
    await guild.channels.create({
      name:
        `ticket-${safeName}-${member.id.slice(-4)}`,

      type:
        ChannelType.GuildText,

      parent:
        TICKET_CATEGORY_ID,

      topic:
        `CRAFTED_SUPPORT|owner=${member.id}|type=${type}`,

      permissionOverwrites:
        overwrites,
    });

  let privacyText;

  if (type === 'specific_person') {
    privacyText =
      'Only you and the person you selected can access this ticket.';
  } else if (type === 'staff_groups') {
    privacyText =
      'Only you and the selected staff groups can access this ticket.';
  } else {
    privacyText =
      'You and the Crafted SMP staff team can access this ticket.';
  }

  const embed = new EmbedBuilder()
    .setTitle('🎫 Support Ticket')
    .setDescription(
      [
        `Welcome ${member}!`,
        '',
        privacyText,
        '',
        'Explain the situation below.',
        '',
        'When everything is resolved, press **Close Ticket**.',
      ].join('\n')
    )
    .setColor(0x2ecc71)
    .setFooter({
      text: `Ticket owner: ${member.user.username}`,
    });

  const closeButton =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Close Ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger)
    );

  await ticketChannel.send({
    content: `${member}`,
    embeds: [embed],
    components: [closeButton],
  });

  return {
    success: true,
    channel: ticketChannel,
  };
}

// =====================================================
// CREATE TRANSCRIPT
// =====================================================

async function createTranscript(channel) {
  let messages = [];
  let before;

  while (true) {
    const options = {
      limit: 100,
    };

    if (before) {
      options.before = before;
    }

    const batch =
      await channel.messages.fetch(options);

    if (batch.size === 0) break;

    messages.push(...batch.values());

    before =
      batch.last().id;

    if (batch.size < 100) break;
  }

  messages.sort(
    (a, b) =>
      a.createdTimestamp -
      b.createdTimestamp
  );

  const lines = [];

  lines.push(
    '=============================================='
  );

  lines.push(
    'CRAFTED SMP SUPPORT TICKET'
  );

  lines.push(
    'CONVERSATION HISTORY'
  );

  lines.push(
    '=============================================='
  );

  lines.push('');

  lines.push(
    `Ticket: #${channel.name}`
  );

  lines.push(
    `Channel ID: ${channel.id}`
  );

  lines.push(
    `Created: ${new Date(
      channel.createdTimestamp
    ).toLocaleString()}`
  );

  lines.push('');

  lines.push(
    '=============================================='
  );

  lines.push('');

  for (const message of messages) {
    const timestamp =
      new Date(
        message.createdTimestamp
      ).toLocaleString();

    lines.push(
      `[${timestamp}]`
    );

    lines.push(
      `${message.author.tag} (${message.author.id})`
    );

    if (message.content) {
      lines.push(
        message.content
      );
    }

    if (message.attachments.size > 0) {
      lines.push('');

      lines.push(
        'Attachments:'
      );

      for (
        const attachment
        of message.attachments.values()
      ) {
        lines.push(
          `${attachment.name || 'Attachment'}`
        );

        lines.push(
          attachment.url
        );
      }
    }

    if (message.embeds.length > 0) {
      lines.push('');

      lines.push(
        `Discord embeds: ${message.embeds.length}`
      );
    }

    lines.push('');

    lines.push(
      '----------------------------------------------'
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
        `${channel.name}-conversation-history.txt`,
    }
  );
}

// =====================================================
// CLOSE TICKET
// =====================================================

async function closeTicket(interaction) {
  const channel =
    interaction.channel;

  const ticketOwnerId =
    getTicketOwner(channel);

  if (!ticketOwnerId) {
    return interaction.reply({
      content:
        '❌ This channel is not a support ticket.',
      ephemeral:
        true,
    });
  }

  if (
    interaction.user.id !== ticketOwnerId &&
    !isStaff(interaction.member)
  ) {
    return interaction.reply({
      content:
        '❌ Only the ticket creator or staff can close this ticket.',
      ephemeral:
        true,
    });
  }

  await interaction.reply({
    content:
      '🔒 Saving the full conversation history...',
    ephemeral:
      true,
  });

  try {
    // Create transcript BEFORE deleting anything
    const transcript =
      await createTranscript(channel);

    const archiveChannel =
      await interaction.guild.channels.fetch(
        CLOSED_TICKET_LOG_CHANNEL_ID
      );

    if (!archiveChannel) {
      throw new Error(
        'Closed ticket archive channel not found.'
      );
    }

    const ticketOwner =
      await interaction.guild.members
        .fetch(ticketOwnerId)
        .catch(() => null);

    const ticketType =
      getTicketType(channel);

    const archiveEmbed =
      new EmbedBuilder()
        .setTitle(
          '🔒 Closed Support Ticket'
        )
        .setDescription(
          [
            'This ticket has been closed.',
            '',
            '📎 The entire ticket conversation is attached to this message.',
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
                : `<@${ticketOwnerId}>`,
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
              ticketType,
            inline:
              true,
          },

          {
            name:
              '🆔 Ticket Channel ID',
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

    await archiveChannel.send({
      embeds: [
        archiveEmbed,
      ],

      files: [
        transcript,
      ],
    });

    await channel.send(
      [
        '✅ **Ticket archived successfully.**',
        '',
        'The complete conversation history was saved.',
        '',
        '🔒 This channel will be deleted in 5 seconds.',
      ].join('\n')
    );

    setTimeout(
      async () => {
        try {
          await channel.delete(
            `Closed by ${interaction.user.tag}`
          );
        } catch (error) {
          console.error(
            'Ticket deletion error:',
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

    await channel.send(
      [
        '❌ **The ticket could not be archived.**',
        '',
        'This channel will NOT be deleted.',
        '',
        'This prevents the conversation from being lost.',
        '',
        'Please tell staff to check the bot console.',
      ].join('\n')
    );
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

      if (interaction.isButton()) {
        // ===============================================
        // SPECIFIC PERSON
        // ===============================================

        if (
          interaction.customId ===
          'ticket_specific_person'
        ) {
          const menu =
            new UserSelectMenuBuilder()
              .setCustomId(
                'ticket_person_select'
              )
              .setPlaceholder(
                'Choose one person'
              )
              .setMinValues(1)
              .setMaxValues(1);

          return interaction.reply({
            content:
              '👤 Choose the person who should be allowed to access this ticket.',

            components: [
              new ActionRowBuilder()
                .addComponents(menu),
            ],

            ephemeral:
              true,
          });
        }

        // ===============================================
        // ALL STAFF
        // ===============================================

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

          return interaction.editReply(
            result.success
              ? `✅ Ticket created: ${result.channel}`
              : result.message
          );
        }

        // ===============================================
        // STAFF GROUPS
        // ===============================================

        if (
          interaction.customId ===
          'ticket_staff_groups'
        ) {
          const menu =
            new StringSelectMenuBuilder()
              .setCustomId(
                'ticket_staff_group_select'
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
              '👥 Choose which staff groups can access the ticket.',

            components: [
              new ActionRowBuilder()
                .addComponents(menu),
            ],

            ephemeral:
              true,
          });
        }

        // ===============================================
        // CLOSE TICKET
        // ===============================================

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
      // PERSON SELECT
      // =================================================

      if (
        interaction.isUserSelectMenu() &&
        interaction.customId ===
          'ticket_person_select'
      ) {
        await interaction.deferUpdate();

        const selectedUserId =
          interaction.values[0];

        if (
          selectedUserId ===
          interaction.user.id
        ) {
          return interaction.editReply({
            content:
              '❌ You cannot select yourself.',

            components:
              [],
          });
        }

        const selectedMember =
          await interaction.guild.members
            .fetch(selectedUserId)
            .catch(() => null);

        if (
          !selectedMember ||
          selectedMember.user.bot
        ) {
          return interaction.editReply({
            content:
              '❌ Choose a valid server member.',

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
              'specific_person',

            allowedUsers: [
              selectedUserId,
            ],
          });

        return interaction.editReply({
          content:
            result.success
              ? `✅ Private ticket created with ${selectedMember}: ${result.channel}`
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
          'ticket_staff_group_select'
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
    } catch (error) {
      console.error(
        'Interaction error:',
        error
      );

      const errorMessage =
        '❌ Something went wrong. Please try again.';

      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction
          .followUp({
            content:
              errorMessage,
            ephemeral:
              true,
          })
          .catch(() => {});
      } else {
        await interaction
          .reply({
            content:
              errorMessage,
            ephemeral:
              true,
          })
          .catch(() => {});
      }
    }
  }
);

// =====================================================
// READY
// =====================================================

client.once(
  Events.ClientReady,
  async (readyClient) => {
    console.log(
      '========================================'
    );

    console.log(
      `✅ Logged in as ${readyClient.user.tag}`
    );

    console.log(
      '✅ Crafted SMP Support Bot Online'
    );

    console.log(
      '========================================'
    );

    try {
      const guild =
        await client.guilds.fetch(
          GUILD_ID
        );

      console.log(
        `✅ Server: ${guild.name}`
      );

      await createSupportPanel(
        guild
      );

      const archive =
        await guild.channels.fetch(
          CLOSED_TICKET_LOG_CHANNEL_ID
        );

      console.log(
        `✅ Ticket archive: #${archive.name}`
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
// PROCESS ERRORS
// =====================================================

process.on(
  'unhandledRejection',
  (error) => {
    console.error(
      'Unhandled promise rejection:',
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
