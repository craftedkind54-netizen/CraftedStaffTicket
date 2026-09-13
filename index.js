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
// CRAFTED SMP STAFF TICKET BOT
// =====================================================

// ONLY Railway variable required:
// DISCORD_TOKEN=your_bot_token

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// =====================================================
// SERVER SETTINGS
// =====================================================

const GUILD_ID = '1543363950262100118';

// Channel containing the ticket panel
const SUPPORT_PANEL_CHANNEL_ID = '1543375387088781483';

// Category where open tickets are created
const TICKET_CATEGORY_ID = '1548760763655520336';

// All closed ticket transcripts go here
const CLOSED_TICKET_LOG_CHANNEL_ID = '1548792161334726787';

// =====================================================
// STAFF ROLE IDS
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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
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

function isStaff(member) {
  return STAFF_ROLE_IDS.some((roleId) =>
    member.roles.cache.has(roleId)
  );
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
    throw new Error(
      'Support panel channel could not be found.'
    );
  }

  const recentMessages = await panelChannel.messages.fetch({
    limit: 50,
  });

  const existingPanel = recentMessages.find(
    (message) =>
      message.author.id === client.user.id &&
      message.embeds[0]?.title ===
        '🎫 Crafted SMP Support'
  );

  if (existingPanel) {
    console.log('✅ Ticket panel already exists.');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🎫 Crafted SMP Support')
    .setDescription(
      [
        'Need help?',
        '',
        'Choose how you want your support ticket shared.',
        '',
        '👤 **Specific Person**',
        'Choose one specific person who can access the ticket.',
        '',
        '🛡️ **All Staff**',
        'Allow the entire Crafted SMP staff team to access the ticket.',
        '',
        '👥 **Specific Staff Groups**',
        'Choose exactly which staff groups are allowed to access the ticket.',
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

  await panelChannel.send({
    embeds: [embed],
    components: [buttons],
  });

  console.log('✅ Ticket panel created.');
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

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionsBitField.Flags.ViewChannel,
      ],
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

  // ===================================================
  // SPECIFIC USERS
  // ===================================================

  for (const userId of allowedUsers) {
    permissionOverwrites.push({
      id: userId,
      allow: ticketPermissions(),
    });
  }

  // ===================================================
  // STAFF ROLES
  // ===================================================

  for (const roleId of STAFF_ROLE_IDS) {
    if (allowedRoles.includes(roleId)) {
      permissionOverwrites.push({
        id: roleId,
        allow: ticketPermissions(),
      });
    } else {
      permissionOverwrites.push({
        id: roleId,
        deny: [
          PermissionsBitField.Flags.ViewChannel,
        ],
      });
    }
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

      permissionOverwrites,
    });

  let privacyMessage =
    'This ticket is private.';

  if (type === 'specific_person') {
    privacyMessage =
      'Only you and the person you selected can access this ticket.';
  }

  if (type === 'all_staff') {
    privacyMessage =
      'You and all Crafted SMP staff can access this ticket.';
  }

  if (type === 'staff_groups') {
    privacyMessage =
      'Only you and the staff groups you selected can access this ticket.';
  }

  const ticketEmbed = new EmbedBuilder()
    .setTitle('🎫 Support Ticket')
    .setDescription(
      [
        `Welcome ${member}!`,
        '',
        privacyMessage,
        '',
        'Explain what you need help with below.',
        '',
        'When the situation is resolved, press **Close Ticket**.',
      ].join('\n')
    )
    .setColor(0x2ecc71)
    .setFooter({
      text:
        `Ticket owner: ${member.user.username}`,
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
    embeds: [ticketEmbed],
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

  allMessages.sort(
    (a, b) =>
      a.createdTimestamp -
      b.createdTimestamp
  );

  const transcript = [];

  transcript.push(
    '=================================================='
  );

  transcript.push(
    'CRAFTED SMP SUPPORT TICKET'
  );

  transcript.push(
    'FULL CONVERSATION HISTORY'
  );

  transcript.push(
    '=================================================='
  );

  transcript.push('');

  transcript.push(
    `Ticket: #${channel.name}`
  );

  transcript.push(
    `Channel ID: ${channel.id}`
  );

  transcript.push(
    `Created: ${new Date(
      channel.createdTimestamp
    ).toLocaleString()}`
  );

  transcript.push('');

  transcript.push(
    '=================================================='
  );

  transcript.push('');

  for (const message of allMessages) {
    const time =
      new Date(
        message.createdTimestamp
      ).toLocaleString();

    transcript.push(
      `[${time}]`
    );

    transcript.push(
      `${message.author.tag} (${message.author.id})`
    );

    transcript.push('');

    if (message.content) {
      transcript.push(
        message.content
      );
    } else {
      transcript.push(
        '[No text content]'
      );
    }

    if (message.attachments.size > 0) {
      transcript.push('');

      transcript.push(
        'ATTACHMENTS:'
      );

      for (
        const attachment
        of message.attachments.values()
      ) {
        transcript.push(
          `Name: ${attachment.name || 'Attachment'}`
        );

        transcript.push(
          `URL: ${attachment.url}`
        );
      }
    }

    if (message.embeds.length > 0) {
      transcript.push('');

      transcript.push(
        `Discord embeds: ${message.embeds.length}`
      );
    }

    transcript.push('');

    transcript.push(
      '--------------------------------------------------'
    );

    transcript.push('');
  }

  const fileBuffer =
    Buffer.from(
      transcript.join('\n'),
      'utf8'
    );

  return new AttachmentBuilder(
    fileBuffer,
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
        '❌ This channel is not recognized as a support ticket.',
      ephemeral: true,
    });
  }

  const canClose =
    interaction.user.id === ticketOwnerId ||
    isStaff(interaction.member);

  if (!canClose) {
    return interaction.reply({
      content:
        '❌ Only the ticket creator or staff can close this ticket.',
      ephemeral: true,
    });
  }

  await interaction.reply({
    content:
      '🔒 Saving the full ticket conversation...',
    ephemeral: true,
  });

  try {
    // =================================================
    // CREATE TRANSCRIPT BEFORE DELETING ANYTHING
    // =================================================

    const transcript =
      await createTranscript(channel);

    // =================================================
    // ARCHIVE CHANNEL
    // =================================================

    const archiveChannel =
      await interaction.guild.channels.fetch(
        CLOSED_TICKET_LOG_CHANNEL_ID
      );

    if (!archiveChannel) {
      throw new Error(
        'Ticket archive channel not found.'
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
            'This support ticket has been closed.',
            '',
            '📎 The complete conversation history is attached below.',
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

    // =================================================
    // SAVE CLOSED TICKET
    // =================================================

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
        'The complete conversation history has been saved.',
        '',
        '🔒 This ticket will be deleted in 5 seconds.',
      ].join('\n')
    );

    // =================================================
    // DELETE ORIGINAL TICKET
    // =================================================

    setTimeout(
      async () => {
        try {
          await channel.delete(
            `Ticket closed by ${interaction.user.tag}`
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

    // NEVER delete a ticket if saving failed.

    await channel.send(
      [
        '❌ **Ticket archive failed.**',
        '',
        'This ticket will NOT be deleted.',
        '',
        'That prevents the conversation from being lost.',
        '',
        'Please tell staff to check the bot console.',
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
        // SPECIFIC PERSON
        // ===============================================

        if (
          interaction.customId ===
          'ticket_specific_person'
        ) {
          const personMenu =
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
              '👤 Choose the person who should have access to your ticket.',

            components: [
              new ActionRowBuilder()
                .addComponents(
                  personMenu
                ),
            ],

            ephemeral: true,
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
            ephemeral: true,
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
          const staffMenu =
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
              '👥 Choose which staff groups can access your ticket.',

            components: [
              new ActionRowBuilder()
                .addComponents(
                  staffMenu
                ),
            ],

            ephemeral: true,
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
      // SPECIFIC PERSON SELECTION
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
              '❌ You cannot choose yourself.',

            components:
              [],
          });
        }

        const selectedMember =
          await interaction.guild.members
            .fetch(
              selectedUserId
            )
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
      // STAFF GROUP SELECTION
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
      '✅ Crafted SMP Staff Ticket Bot Online'
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
        `✅ Server connected: ${guild.name}`
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
          `✅ Closed tickets: #${archiveChannel.name}`
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
