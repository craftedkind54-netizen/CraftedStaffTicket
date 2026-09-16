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
// STABLE MULTI-TICKET VERSION
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
// TICKET CREATION LOCK
// =====================================================

// Prevents somebody double-clicking buttons
// and accidentally creating multiple tickets.

const ticketCreationLocks = new Set();

// =====================================================
// STAFF CACHE
// =====================================================

let staffCache = [];

let staffCacheTime = 0;

const STAFF_CACHE_LIFETIME = 60 * 1000;

// =====================================================
// HELPERS
// =====================================================

function isStaff(member) {
  if (!member) {
    return false;
  }

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
  if (!channel?.topic) {
    return null;
  }

  const match =
    channel.topic.match(/owner=(\d+)/);

  return match
    ? match[1]
    : null;
}

function getTicketType(channel) {
  if (!channel?.topic) {
    return 'unknown';
  }

  const match =
    channel.topic.match(/type=([^|]+)/);

  return match
    ? match[1]
    : 'unknown';
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
// STAFF CACHE
// =====================================================

async function refreshStaffCache(guild) {
  const now = Date.now();

  if (
    staffCache.length > 0 &&
    now - staffCacheTime <
      STAFF_CACHE_LIFETIME
  ) {
    return staffCache;
  }

  // Do NOT repeatedly fetch every server member.
  // Use the member cache that was loaded at startup.

  staffCache =
    guild.members.cache
      .filter(
        (member) =>
          !member.user.bot &&
          isStaff(member)
      )
      .map(
        (member) => member
      );

  staffCacheTime =
    now;

  return staffCache;
}

// =====================================================
// FIND EXISTING TICKET
// =====================================================

function findExistingTicket(
  guild,
  userId
) {
  return guild.channels.cache.find(
    (channel) =>
      channel.type ===
        ChannelType.GuildText &&
      channel.parentId ===
        TICKET_CATEGORY_ID &&
      getTicketOwner(channel) ===
        userId
  );
}

// =====================================================
// SUPPORT PANEL
// =====================================================

async function createSupportPanel(guild) {
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
          'All tickets are private.',
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
// SINGLE STAFF MENU
// =====================================================

async function showSpecificStaffMenu(
  interaction
) {
  await interaction.deferReply({
    ephemeral: true,
  });

  const staffMembers =
    await refreshStaffCache(
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

// =====================================================
// MULTIPLE STAFF MENU
// =====================================================

async function showMultipleStaffMenu(
  interaction
) {
  await interaction.deferReply({
    ephemeral: true,
  });

  const staffMembers =
    await refreshStaffCache(
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
  const userId =
    member.id;

  // ===================================================
  // CREATION LOCK
  // ===================================================

  if (
    ticketCreationLocks.has(
      userId
    )
  ) {
    return {
      success: false,

      message:
        '⏳ Your ticket is already being created. Please wait a moment.',
    };
  }

  ticketCreationLocks.add(
    userId
  );

  try {

    // =================================================
    // CHECK EXISTING TICKET
    // =================================================

    const existingTicket =
      findExistingTicket(
        guild,
        userId
      );

    if (existingTicket) {
      return {
        success: false,

        message:
          `❌ You already have an open ticket: ${existingTicket}`,
      };
    }

    // =================================================
    // PERMISSIONS
    // =================================================

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
      },

      {
        id:
          client.user.id,

        allow: [
          ...ticketPermissions(),

          PermissionsBitField.Flags
            .ManageChannels,

          PermissionsBitField.Flags
            .ManageMessages,
        ],
      },
    ];

    // =================================================
    // STAFF ROLE ACCESS
    // =================================================

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
        });
      } else {
        overwrites.push({
          id:
            roleId,

          deny: [
            PermissionsBitField.Flags
              .ViewChannel,
          ],
        });
      }
    }

    // =================================================
    // SPECIFIC STAFF ACCESS
    // =================================================

    for (
      const selectedUserId
      of allowedUsers
    ) {
      overwrites.push({
        id:
          selectedUserId,

        allow:
          ticketPermissions(),
      });
    }

    // =================================================
    // CREATE CHANNEL
    // =================================================

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
          `CRAFTED_SUPPORT|owner=${member.id}|type=${type}`,

        permissionOverwrites:
          overwrites,

        reason:
          `Support ticket opened by ${member.user.tag}`,
      });

    // =================================================
    // PRIVACY TEXT
    // =================================================

    let privacyText =
      'This is a private support ticket.';

    if (
      type ===
      'specific_staff'
    ) {
      privacyText =
        'Only you and the staff member you selected can access this ticket.';
    }

    if (
      type ===
      'all_staff'
    ) {
      privacyText =
        'You and all Crafted SMP staff can access this ticket.';
    }

    if (
      type ===
      'staff_groups'
    ) {
      privacyText =
        'Only you and the selected staff groups can access this ticket.';
    }

    if (
      type ===
      'multiple_staff'
    ) {
      privacyText =
        'Only you and the specific staff members you selected can access this ticket.';
    }

    // =================================================
    // TICKET MESSAGE
    // =================================================

    const embed =
      new EmbedBuilder()
        .setTitle(
          '🎫 Support Ticket'
        )
        .setDescription(
          [
            `Welcome ${member}!`,
            '',
            privacyText,
            '',
            'Explain what you need help with below.',
            '',
            'A staff member can close this ticket when it is resolved.',
          ].join('\n')
        )
        .setColor(
          0x2ecc71
        )
        .setFooter({
          text:
            `Ticket opened by ${member.user.username}`,
        });

    const closeButton =
      new ActionRowBuilder()
        .addComponents(
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
        closeButton,
      ],

      allowedMentions: {
        users: [
          member.id,
        ],
      },
    });

    return {
      success: true,

      channel:
        ticketChannel,
    };

  } catch (error) {

    console.error(
      'Ticket creation error:',
      error
    );

    return {
      success: false,

      message:
        '❌ The ticket could not be created. Please try again.',
    };

  } finally {

    // ALWAYS release the lock.

    ticketCreationLocks.delete(
      userId
    );
  }
}

// =====================================================
// TRANSCRIPT
// =====================================================

async function createTranscript(
  channel
) {
  const allMessages = [];

  let before;

  while (true) {
    const options = {
      limit:
        100,
    };

    if (before) {
      options.before =
        before;
    }

    const messages =
      await channel.messages.fetch(
        options
      );

    if (
      messages.size === 0
    ) {
      break;
    }

    allMessages.push(
      ...messages.values()
    );

    before =
      messages.last().id;

    if (
      messages.size < 100
    ) {
      break;
    }
  }

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

  for (
    const message
    of allMessages
  ) {
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

    lines.push(
      message.content ||
        '[No text content]'
    );

    if (
      message.attachments.size >
      0
    ) {
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

    if (
      message.embeds.length >
      0
    ) {
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

async function closeTicket(
  interaction
) {
  const channel =
    interaction.channel;

  const ticketOwnerId =
    getTicketOwner(
      channel
    );

  if (!ticketOwnerId) {
    return interaction.reply({
      content:
        '❌ This is not a support ticket.',

      ephemeral:
        true,
    });
  }

  if (
    !isStaff(
      interaction.member
    )
  ) {
    return interaction.reply({
      content:
        '❌ Only staff members can close tickets.',

      ephemeral:
        true,
    });
  }

  await interaction.deferReply({
    ephemeral:
      true,
  });

  await interaction.editReply({
    content:
      '🔒 Saving the ticket conversation...',
  });

  try {
    const transcript =
      await createTranscript(
        channel
      );

    const archiveChannel =
      await interaction.guild.channels.fetch(
        CLOSED_TICKET_LOG_CHANNEL_ID
      );

    if (!archiveChannel) {
      throw new Error(
        'Closed ticket channel not found.'
      );
    }

    const ticketOwner =
      await interaction.guild.members
        .fetch(
          ticketOwnerId
        )
        .catch(
          () => null
        );

    const ticketType =
      getTicketType(
        channel
      );

    const archiveEmbed =
      new EmbedBuilder()
        .setTitle(
          '🔒 Closed Support Ticket'
        )
        .setDescription(
          [
            'This ticket has been closed.',
            '',
            '📎 The full conversation history is attached.',
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

    await archiveChannel.send({
      embeds: [
        archiveEmbed,
      ],

      files: [
        transcript,
      ],
    });

    await interaction.editReply({
      content:
        '✅ Ticket archived successfully.',
    });

    await channel.send(
      [
        '✅ **Ticket saved successfully.**',
        '',
        'The conversation history has been archived.',
        '',
        '🔒 This ticket will be deleted in 5 seconds.',
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
            'Delete error:',
            error
          );
        }
      },

      5000
    );

  } catch (error) {

    console.error(
      'Archive error:',
      error
    );

    await interaction.editReply({
      content:
        '❌ The ticket could not be archived. The channel will NOT be deleted.',
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

        // SPECIFIC STAFF

        if (
          interaction.customId ===
          'ticket_specific_staff'
        ) {
          return showSpecificStaffMenu(
            interaction
          );
        }

        // ALL STAFF

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
                ? `✅ Ticket created: ${result.channel}`
                : result.message,
          });
        }

        // STAFF GROUPS

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
              '👥 Choose which staff groups can access the ticket.',

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

        // MULTIPLE STAFF

        if (
          interaction.customId ===
          'ticket_multiple_staff'
        ) {
          return showMultipleStaffMenu(
            interaction
          );
        }

        // CLOSE

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
          interaction.guild.members.cache.get(
            selectedStaffId
          );

        if (
          !selectedStaff ||
          !isStaff(
            selectedStaff
          ) ||
          selectedStaff.user.bot
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

        const validStaffIds =
          interaction.values.filter(
            (staffId) => {
              const member =
                interaction.guild.members.cache.get(
                  staffId
                );

              return (
                member &&
                !member.user.bot &&
                isStaff(member)
              );
            }
          );

        if (
          validStaffIds.length < 2
        ) {
          return interaction.editReply({
            content:
              '❌ You need to choose at least 2 valid staff members.',

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

    } catch (error) {

      console.error(
        'Interaction error:',
        error
      );

      const errorMessage =
        '❌ Something went wrong. Please try again.';

      if (
        interaction.deferred ||
        interaction.replied
      ) {
        await interaction
          .followUp({
            content:
              errorMessage,

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
              errorMessage,

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
// KEEP STAFF CACHE UPDATED
// =====================================================

client.on(
  Events.GuildMemberUpdate,

  () => {
    staffCacheTime =
      0;
  }
);

client.on(
  Events.GuildMemberAdd,

  () => {
    staffCacheTime =
      0;
  }
);

client.on(
  Events.GuildMemberRemove,

  () => {
    staffCacheTime =
      0;
  }
);

// =====================================================
// READY
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

      // ONE full member fetch at startup.
      // We do not repeat this every button press.

      await guild.members.fetch();

      console.log(
        `✅ Connected to ${guild.name}`
      );

      await refreshStaffCache(
        guild
      );

      console.log(
        `✅ Found ${staffCache.length} staff members`
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
        '✅ Multi-ticket system ready.'
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
