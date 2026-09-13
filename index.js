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
// CRAFTED SMP SUPPORT TICKET BOT
// =====================================================

// Railway Variable:
// DISCORD_TOKEN = your new bot token
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// =====================================================
// SERVER
// =====================================================

const GUILD_ID = '1543363950262100118';

// Players create tickets here
const SUPPORT_PANEL_CHANNEL_ID = '1543375387088781483';

// Open tickets are created inside this category
const TICKET_CATEGORY_ID = '1548760763655520336';

// Closed ticket transcripts are sent here
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

  return STAFF_ROLE_IDS.some((roleId) =>
    member.roles.cache.has(roleId)
  );
}

function cleanChannelName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);
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

function ticketPermissions() {
  return [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ReadMessageHistory,
    PermissionsBitField.Flags.AttachFiles,
    PermissionsBitField.Flags.EmbedLinks,
  ];
}

// =====================================================
// CREATE SUPPORT PANEL
// =====================================================

async function createSupportPanel(guild) {
  const panelChannel = await guild.channels.fetch(
    SUPPORT_PANEL_CHANNEL_ID
  );

  if (!panelChannel) {
    throw new Error('Support panel channel not found.');
  }

  // Prevent duplicate panels after every restart
  const messages = await panelChannel.messages.fetch({
    limit: 50,
  });

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
    .setDescription(
      [
        'Need help?',
        '',
        'Choose how you want your support ticket handled.',
        '',
        '👤 **Specific Staff Member**',
        'Choose one specific staff member.',
        '',
        '🛡️ **All Staff**',
        'Allow the entire staff team to see the ticket.',
        '',
        '👥 **Specific Staff Groups**',
        'Choose which staff groups can see the ticket.',
        '',
        'Your ticket will be created as a private channel.',
      ].join('\n')
    )
    .setColor(0x3498db)
    .setFooter({
      text: 'Crafted SMP Support System',
    });

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
      .setStyle(ButtonStyle.Secondary)
  );

  await panelChannel.send({
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
  // Prevent multiple open tickets from same player
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

  const overwrites = [
    // Hide from everyone
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionsBitField.Flags.ViewChannel,
      ],
    },

    // Ticket creator
    {
      id: member.id,
      allow: ticketPermissions(),
    },

    // Bot
    {
      id: client.user.id,
      allow: [
        ...ticketPermissions(),
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
      ],
    },
  ];

  // ===================================================
  // STAFF ROLE ACCESS
  // ===================================================

  for (const roleId of STAFF_ROLE_IDS) {
    if (allowedRoles.includes(roleId)) {
      overwrites.push({
        id: roleId,
        allow: ticketPermissions(),
      });
    } else {
      overwrites.push({
        id: roleId,
        deny: [
          PermissionsBitField.Flags.ViewChannel,
        ],
      });
    }
  }

  // ===================================================
  // SPECIFIC STAFF MEMBER ACCESS
  // ===================================================

  for (const userId of allowedUsers) {
    overwrites.push({
      id: userId,
      allow: ticketPermissions(),
    });
  }

  const username =
    cleanChannelName(member.user.username) ||
    'player';

  const ticketChannel =
    await guild.channels.create({
      name:
        `ticket-${username}-${member.id.slice(-4)}`,

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

  if (type === 'specific_staff') {
    privacyText =
      'Only you and the staff member you selected can access this ticket.';
  } else if (type === 'staff_groups') {
    privacyText =
      'Only you and the selected staff groups can access this ticket.';
  } else {
    privacyText =
      'You and the entire Crafted SMP staff team can access this ticket.';
  }

  const embed = new EmbedBuilder()
    .setTitle('🎫 Support Ticket')
    .setDescription(
      [
        `Welcome ${member}!`,
        '',
        privacyText,
        '',
        'Explain the problem or situation below.',
        '',
        'A staff member can close this ticket once it is resolved.',
      ].join('\n')
    )
    .setColor(0x2ecc71)
    .setFooter({
      text:
        `Ticket opened by ${member.user.username}`,
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
// CREATE FULL TRANSCRIPT
// =====================================================

async function createTranscript(channel) {
  let allMessages = [];
  let before;

  while (true) {
    const options = {
      limit: 100,
    };

    if (before) {
      options.before = before;
    }

    const messages =
      await channel.messages.fetch(options);

    if (messages.size === 0) {
      break;
    }

    allMessages.push(
      ...messages.values()
    );

    before =
      messages.last().id;

    if (messages.size < 100) {
      break;
    }
  }

  // Oldest message first
  allMessages.sort(
    (a, b) =>
      a.createdTimestamp -
      b.createdTimestamp
  );

  const lines = [];

  lines.push(
    '=================================================='
  );

  lines.push(
    'CRAFTED SMP SUPPORT TICKET'
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
    `Created: ${new Date(
      channel.createdTimestamp
    ).toLocaleString()}`
  );

  lines.push('');

  lines.push(
    '=================================================='
  );

  lines.push('');

  for (const message of allMessages) {
    const date =
      new Date(
        message.createdTimestamp
      ).toLocaleString();

    lines.push(
      `[${date}]`
    );

    lines.push(
      `${message.author.tag} (${message.author.id})`
    );

    lines.push('');

    if (message.content) {
      lines.push(
        message.content
      );
    } else {
      lines.push(
        '[No text content]'
      );
    }

    // Save attachment links
    if (message.attachments.size > 0) {
      lines.push('');

      lines.push(
        'ATTACHMENTS:'
      );

      for (
        const attachment
        of message.attachments.values()
      ) {
        lines.push(
          `Name: ${attachment.name || 'Attachment'}`
        );

        lines.push(
          `URL: ${attachment.url}`
        );
      }
    }

    // Record embeds
    if (message.embeds.length > 0) {
      lines.push('');

      lines.push(
        `Discord embeds: ${message.embeds.length}`
      );
    }

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
      ephemeral: true,
    });
  }

  // ONLY STAFF CAN CLOSE TICKETS
  if (!isStaff(interaction.member)) {
    return interaction.reply({
      content:
        '❌ Only staff members can close support tickets.',
      ephemeral: true,
    });
  }

  await interaction.reply({
    content:
      '🔒 Saving the complete conversation history...',
    ephemeral: true,
  });

  try {
    // Create transcript BEFORE deleting anything
    const transcript =
      await createTranscript(channel);

    // Find archive channel
    const archiveChannel =
      await interaction.guild.channels.fetch(
        CLOSED_TICKET_LOG_CHANNEL_ID
      );

    if (!archiveChannel) {
      throw new Error(
        'Closed ticket archive channel not found.'
      );
    }

    // Get ticket owner
    const ticketOwner =
      await interaction.guild.members
        .fetch(ticketOwnerId)
        .catch(() => null);

    const ticketType =
      getTicketType(channel);

    let ticketTypeName =
      ticketType;

    if (ticketType === 'specific_staff') {
      ticketTypeName =
        'Specific Staff Member';
    }

    if (ticketType === 'all_staff') {
      ticketTypeName =
        'All Staff';
    }

    if (ticketType === 'staff_groups') {
      ticketTypeName =
        'Specific Staff Groups';
    }

    const archiveEmbed =
      new EmbedBuilder()
        .setTitle(
          '🔒 Closed Support Ticket'
        )
        .setDescription(
          [
            'This ticket has been closed.',
            '',
            '📎 The complete conversation history is attached to this message.',
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
              ticketTypeName,
            inline:
              true,
          },

          {
            name:
              '🆔 Original Channel ID',
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

    // Save ticket archive
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
        'The full conversation history has been saved.',
        '',
        '🔒 This ticket will be deleted in 5 seconds.',
      ].join('\n')
    );

    // Delete ticket after successful archive
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

    // NEVER delete ticket if archive fails
    await channel.send(
      [
        '❌ **Ticket archive failed.**',
        '',
        'This ticket will NOT be deleted.',
        '',
        'That prevents the conversation from being lost.',
        '',
        'Please tell an administrator to check the bot console.',
      ].join('\n')
    );
  }
}

// =====================================================
// INTERACTION HANDLER
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
        // SPECIFIC STAFF MEMBER
        // ===============================================

        if (
          interaction.customId ===
          'ticket_specific_staff'
        ) {
          const menu =
            new UserSelectMenuBuilder()
              .setCustomId(
                'ticket_specific_staff_select'
              )
              .setPlaceholder(
                'Choose a staff member'
              )
              .setMinValues(1)
              .setMaxValues(1);

          return interaction.reply({
            content:
              '👤 Select the staff member you want to speak with.',

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

                  description:
                    'Allow General Staff',

                  value:
                    GENERAL_STAFF_ROLE_ID,

                  emoji:
                    '🛡️',
                },

                {
                  label:
                    'Senior Staff',

                  description:
                    'Allow Senior Staff',

                  value:
                    SENIOR_STAFF_ROLE_ID,

                  emoji:
                    '⭐',
                },

                {
                  label:
                    'Co-Owner',

                  description:
                    'Allow Co-Owner',

                  value:
                    CO_OWNER_ROLE_ID,

                  emoji:
                    '👑',
                },

                {
                  label:
                    'Owner',

                  description:
                    'Allow Owner',

                  value:
                    OWNER_ROLE_ID,

                  emoji:
                    '👑',
                }
              );

          return interaction.reply({
            content:
              '👥 Choose which staff groups should be able to see the ticket.',

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

        // ===============================================
        // CLOSE
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
      // SPECIFIC STAFF SELECTION
      // =================================================

      if (
        interaction.isUserSelectMenu() &&
        interaction.customId ===
          'ticket_specific_staff_select'
      ) {
        await interaction.deferUpdate();

        const selectedUserId =
          interaction.values[0];

        const selectedMember =
          await interaction.guild.members
            .fetch(
              selectedUserId
            )
            .catch(() => null);

        if (!selectedMember) {
          return interaction.editReply({
            content:
              '❌ I could not find that server member.',

            components:
              [],
          });
        }

        // IMPORTANT:
        // Only users with one of the staff roles are accepted
        if (!isStaff(selectedMember)) {
          return interaction.editReply({
            content:
              '❌ That person is not a staff member. Please choose someone with a staff role.',

            components:
              [],
          });
        }

        if (selectedMember.user.bot) {
          return interaction.editReply({
            content:
              '❌ Please choose a staff member, not a bot.',

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
      // STAFF GROUP SELECTION
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
    } catch (error) {
      console.error(
        'Interaction error:',
        error
      );

      const message =
        '❌ Something went wrong. Please try again.';

      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction
          .followUp({
            content:
              message,

            ephemeral:
              true,
          })
          .catch(() => {});
      } else {
        await interaction
          .reply({
            content:
              message,

            ephemeral:
              true,
          })
          .catch(() => {});
      }
    }
  }
);

// =====================================================
// BOT READY
// =====================================================

client.once(
  Events.ClientReady,
  async (readyClient) => {
    console.log(
      '=========================================='
    );

    console.log(
      `✅ Logged in as ${readyClient.user.tag}`
    );

    console.log(
      '✅ Crafted SMP Support Bot Online'
    );

    console.log(
      '=========================================='
    );

    try {
      const guild =
        await client.guilds.fetch(
          GUILD_ID
        );

      console.log(
        `✅ Connected to: ${guild.name}`
      );

      await createSupportPanel(
        guild
      );

      const archiveChannel =
        await guild.channels.fetch(
          CLOSED_TICKET_LOG_CHANNEL_ID
        );

      if (archiveChannel) {
        console.log(
          `✅ Closed ticket archive: #${archiveChannel.name}`
        );
      }
    } catch (error) {
      console.error(
        '❌ Startup error:',
        error
      );
    }
  }
);

// =====================================================
// ERROR HANDLING
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
    '❌ DISCORD_TOKEN is missing from Railway Variables.'
  );

  process.exit(1);
}

client.login(
  DISCORD_TOKEN
);
