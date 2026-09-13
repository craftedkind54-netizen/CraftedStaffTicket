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

// Players create tickets here
const SUPPORT_PANEL_CHANNEL_ID = '1543375387088781483';

// Open tickets go inside this category
const TICKET_CATEGORY_ID = '1548760763655520336';

// All closed ticket transcripts go here
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
    .substring(0, 50);
}

function isStaff(member) {
  return STAFF_ROLE_IDS.some((roleId) =>
    member.roles.cache.has(roleId)
  );
}

function createTicketTopic(ownerId, type) {
  return `CRAFTED_SUPPORT|owner=${ownerId}|type=${type}`;
}

function getTicketOwner(channel) {
  if (!channel.topic) return null;

  const match = channel.topic.match(/owner=(\d+)/);

  return match ? match[1] : null;
}

// =====================================================
// SUPPORT PANEL
// =====================================================

async function createSupportPanel(guild) {
  const channel = await guild.channels.fetch(
    SUPPORT_PANEL_CHANNEL_ID
  );

  if (!channel) {
    throw new Error('Support panel channel was not found.');
  }

  const recentMessages = await channel.messages.fetch({
    limit: 20,
  });

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
        'Make a private support ticket for the staff team.',
        '',
        '👥 **Specific Staff Groups**',
        'Choose which staff groups can see your ticket.',
        '',
        'Your ticket will be created as a private channel.',
      ].join('\n')
    )
    .setColor(0x3498db)
    .setFooter({
      text: 'Crafted SMP Support System',
    });

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

  await channel.send({
    embeds: [embed],
    components: [row],
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

  // Stop users from opening multiple tickets
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

    // Ticket creator
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

    // Bot
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

  // ===================================================
  // PRIVATE TICKET PROTECTION
  // ===================================================

  if (type !== 'all_staff') {
    permissionOverwrites.push(
      {
        id: OWNER_ROLE_ID,
        deny: [
          PermissionsBitField.Flags.ViewChannel,
        ],
      },
      {
        id: CO_OWNER_ROLE_ID,
        deny: [
          PermissionsBitField.Flags.ViewChannel,
        ],
      }
    );
  }

  // ===================================================
  // SELECTED USERS
  // ===================================================

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

  // ===================================================
  // SELECTED ROLES
  // ===================================================

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

  const closeButton =
    new ActionRowBuilder().addComponents(
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
    .setFooter({
      text: `Ticket owner: ${member.user.username}`,
    });

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
// CREATE FULL CONVERSATION TRANSCRIPT
// =====================================================

async function createTranscript(channel) {
  let allMessages = [];
  let lastId;

  while (true) {
    const options = {
      limit: 100,
    };

    if (lastId) {
      options.before = lastId;
    }

    const messages =
      await channel.messages.fetch(options);

    if (messages.size === 0) break;

    allMessages.push(...messages.values());

    lastId = messages.last().id;

    if (messages.size < 100) break;
  }

  // Oldest message first
  allMessages = allMessages.sort(
    (a, b) =>
      a.createdTimestamp - b.createdTimestamp
  );

  const transcriptLines = [];

  transcriptLines.push(
    '=========================================='
  );

  transcriptLines.push(
    'CRAFTED SMP SUPPORT TICKET TRANSCRIPT'
  );

  transcriptLines.push(
    '=========================================='
  );

  transcriptLines.push('');

  transcriptLines.push(
    `Ticket: #${channel.name}`
  );

  transcriptLines.push(
    `Channel ID: ${channel.id}`
  );

  transcriptLines.push(
    `Created: ${new Date(
      channel.createdTimestamp
    ).toLocaleString()}`
  );

  transcriptLines.push('');

  transcriptLines.push(
    '=========================================='
  );

  transcriptLines.push('');

  // ===================================================
  // SAVE EVERY MESSAGE
  // ===================================================

  for (const message of allMessages) {

    const date = new Date(
      message.createdTimestamp
    ).toLocaleString();

    transcriptLines.push(
      `[${date}]`
    );

    transcriptLines.push(
      `${message.author.tag} (${message.author.id})`
    );

    transcriptLines.push(
      message.content || '[No text content]'
    );

    // Save attachment URLs
    if (message.attachments.size > 0) {

      transcriptLines.push('');

      transcriptLines.push(
        'Attachments:'
      );

      for (
        const attachment
        of message.attachments.values()
      ) {
        transcriptLines.push(
          `${attachment.name || 'Attachment'}`
        );

        transcriptLines.push(
          attachment.url
        );
      }
    }

    // Note embeds
    if (message.embeds.length > 0) {
      transcriptLines.push(
        `[${message.embeds.length} Discord embed(s)]`
      );
    }

    transcriptLines.push('');

    transcriptLines.push(
      '------------------------------------------'
    );

    transcriptLines.push('');
  }

  const transcript =
    transcriptLines.join('\n');

  const buffer =
    Buffer.from(
      transcript,
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
// CLOSE + ARCHIVE TICKET
// =====================================================

async function closeTicket(interaction) {

  const channel =
    interaction.channel;

  const ticketOwnerId =
    getTicketOwner(channel);

  if (!ticketOwnerId) {

    return interaction.reply({
      content:
        '❌ This does not appear to be a support ticket.',
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
      '🔒 Closing ticket and saving the full conversation history...',
    ephemeral: true,
  });

  try {

    // =================================================
    // CREATE TRANSCRIPT FIRST
    // =================================================

    const transcript =
      await createTranscript(channel);

    // =================================================
    // GET CLOSED TICKET CHANNEL
    // =================================================

    const logChannel =
      await interaction.guild.channels.fetch(
        CLOSED_TICKET_LOG_CHANNEL_ID
      );

    if (!logChannel) {
      throw new Error(
        'Closed ticket log channel could not be found.'
      );
    }

    // =================================================
    // GET TICKET OWNER
    // =================================================

    const ticketOwner =
      await interaction.guild.members
        .fetch(ticketOwnerId)
        .catch(() => null);

    const ticketType =
      channel.topic
        ?.match(/type=([^|]+)/)?.[1] ||
      'unknown';

    // =================================================
    // CLOSED TICKET INFORMATION
    // =================================================

    const logEmbed =
      new EmbedBuilder()

        .setTitle(
          '🔒 Closed Support Ticket'
        )

        .setDescription(
          [
            'This ticket has been closed.',
            '',
            '📎 **The complete conversation history is attached to this message.**',
          ].join('\n')
        )

        .addFields(
          {
            name: '🎫 Ticket',
            value:
              `#${channel.name}`,
            inline: true,
          },

          {
            name: '👤 Created By',
            value:
              ticketOwner
                ? `${ticketOwner.user.tag}\n<@${ticketOwner.id}>`
                : `<@${ticketOwnerId}>`,
            inline: true,
          },

          {
            name: '🔒 Closed By',
            value:
              `${interaction.user.tag}\n<@${interaction.user.id}>`,
            inline: true,
          },

          {
            name: '📂 Ticket Type',
            value:
              ticketType,
            inline: true,
          },

          {
            name: '🆔 Original Channel',
            value:
              channel.id,
            inline: true,
          }
        )

        .setColor(
          0xe74c3c
        )

        .setTimestamp();

    // =================================================
    // SEND ARCHIVE
    // =================================================

    await logChannel.send({
      embeds: [
        logEmbed,
      ],

      files: [
        transcript,
      ],
    });

    // =================================================
    // CONFIRM SAVE
    // =================================================

    await channel.send(
      [
        '✅ **Ticket saved successfully.**',
        '',
        'The complete conversation history has been archived.',
        '',
        '🔒 This ticket will be deleted in 5 seconds.',
      ].join('\n')
    );

    // =================================================
    // DELETE OPEN TICKET
    // =================================================

    setTimeout(
      async () => {

        try {

          await channel.delete(
            `Ticket closed by ${interaction.user.tag}`
          );

        } catch (error) {

          console.error(
            'Could not delete ticket:',
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

    // IMPORTANT:
    // Do not delete ticket if transcript fails.

    await channel.send(
      [
        '❌ **I could not archive this ticket.**',
        '',
        'The ticket will NOT be deleted.',
        '',
        'This protects the conversation from being lost.',
        '',
        'Please ask an administrator to check the bot console.',
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

        // -----------------------------------------------
        // SPECIFIC PERSON
        // -----------------------------------------------

        if (
          interaction.customId ===
          'ticket_specific_user'
        ) {

          const userMenu =
            new UserSelectMenuBuilder()

              .setCustomId(
                'ticket_choose_specific_user'
              )

              .setPlaceholder(
                'Choose who should see your ticket'
              )

              .setMinValues(1)

              .setMaxValues(1);

          const row =
            new ActionRowBuilder()
              .addComponents(
                userMenu
              );

          return interaction.reply({
            content:
              '👤 **Choose one person who should be allowed to see your ticket.**',

            components: [
              row,
            ],

            ephemeral: true,
          });

        }

        // -----------------------------------------------
        // ALL STAFF
        // -----------------------------------------------

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

          if (!result.success) {

            return interaction.editReply(
              result.message
            );

          }

          return interaction.editReply(
            `✅ Ticket created: ${result.channel}`
          );

        }

        // -----------------------------------------------
        // SPECIFIC STAFF GROUPS
        // -----------------------------------------------

        if (
          interaction.customId ===
          'ticket_specific_groups'
        ) {

          const groupMenu =
            new StringSelectMenuBuilder()

              .setCustomId(
                'ticket_choose_groups'
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

          const row =
            new ActionRowBuilder()
              .addComponents(
                groupMenu
              );

          return interaction.reply({
            content:
              '👥 **Choose which staff groups can see your ticket.**',

            components: [
              row,
            ],

            ephemeral:
              true,
          });

        }

        // -----------------------------------------------
        // CLOSE
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
      // USER SELECT
      // =================================================

      if (
        interaction.isUserSelectMenu()
      ) {

        if (
          interaction.customId ===
          'ticket_choose_specific_user'
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
                '❌ Choose someone other than yourself.',

              components:
                [],
            });

          }

          const selectedMember =
            await interaction.guild.members
              .fetch(
                selectedUserId
              )
              .catch(
                () => null
              );

          if (!selectedMember) {

            return interaction.editReply({
              content:
                '❌ I could not find that server member.',

              components:
                [],
            });

          }

          if (
            selectedMember.user.bot
          ) {

            return interaction.editReply({
              content:
                '❌ Please choose a real server member, not a bot.',

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
                'specific_user',

              allowedUsers: [
                selectedUserId,
              ],

            });

          if (!result.success) {

            return interaction.editReply({
              content:
                result.message,

              components:
                [],
            });

          }

          return interaction.editReply({
            content:
              `✅ Private ticket created with ${selectedMember}: ${result.channel}`,

            components:
              [],
          });

        }

      }

      // =================================================
      // STAFF GROUP SELECT
      // =================================================

      if (
        interaction.isStringSelectMenu()
      ) {

        if (
          interaction.customId ===
          'ticket_choose_groups'
        ) {

          await interaction.deferUpdate();

          const result =
            await createTicket({

              guild:
                interaction.guild,

              member:
                interaction.member,

              type:
                'specific_groups',

              allowedRoles:
                interaction.values,

            });

          if (!result.success) {

            return interaction.editReply({
              content:
                result.message,

              components:
                [],
            });

          }

          return interaction.editReply({
            content:
              `✅ Private ticket created: ${result.channel}`,

            components:
              [],
          });

        }

      }

    } catch (error) {

      console.error(
        'Interaction error:',
        error
      );

      const message =
        '❌ Something went wrong while processing that request.';

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
// BOT READY
// =====================================================

client.once(
  Events.ClientReady,

  async (readyClient) => {

    console.log(
      `✅ Logged in as ${readyClient.user.tag}`
    );

    try {

      const guild =
        await client.guilds.fetch(
          GUILD_ID
        );

      console.log(
        `✅ Connected to ${guild.name}`
      );

      await createSupportPanel(
        guild
      );

      // Check closed ticket channel
      const logChannel =
        await guild.channels.fetch(
          CLOSED_TICKET_LOG_CHANNEL_ID
        );

      if (logChannel) {

        console.log(
          `✅ Closed ticket archive connected: #${logChannel.name}`
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
