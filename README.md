# Crafted SMP Support Bot

## Setup

1. Reset the bot token that was shown publicly.
2. Create a `.env` file from `.env.example`.
3. Put the new Discord bot token in `DISCORD_TOKEN`.
4. Put the closed-ticket transcript channel ID in `CLOSED_TICKET_LOG_CHANNEL_ID`.
5. Run `npm install`.
6. Run `npm start`.

## Important

Never commit `.env` or your Discord token to GitHub.

Discord's actual server owner and users with the Administrator permission can bypass normal channel permission restrictions.
