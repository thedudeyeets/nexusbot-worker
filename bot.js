require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  Events, 
  ActivityType, 
  REST, 
  Routes,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection
} = require('@discordjs/voice');
const play = require('play-dl');
const { createClient } = require('@supabase/supabase-js');

// Initialize clients
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

// Store active players per guild
const players = new Map();
const queues = new Map();

// Slash commands definition
const commands = [
  // AI Commands
  {
    name: "chat",
    description: "Chat with NexusBot AI",
    options: [
      { name: "message", description: "Your message to the AI", type: 3, required: true },
    ],
  },
  {
    name: "ask",
    description: "Ask NexusBot a question",
    options: [
      { name: "message", description: "Your question", type: 3, required: true },
    ],
  },
  {
    name: "imagine",
    description: "Generate an AI image",
    options: [
      { name: "prompt", description: "Describe the image you want to create", type: 3, required: true },
    ],
  },
  
  // Music Commands
  {
    name: "play",
    description: "Play a song from YouTube or Spotify",
    options: [
      { name: "query", description: "Song name, YouTube URL, or Spotify URL", type: 3, required: true },
    ],
  },
  { name: "skip", description: "Skip the current song" },
  { name: "pause", description: "Pause the music" },
  { name: "resume", description: "Resume the music" },
  { name: "stop", description: "Stop the music and clear the queue" },
  { name: "queue", description: "Show the music queue" },
  { name: "nowplaying", description: "Show the currently playing song" },
  {
    name: "volume",
    description: "Set the volume",
    options: [
      { name: "level", description: "Volume level (0-100)", type: 4, required: true, min_value: 0, max_value: 100 },
    ],
  },
  { name: "shuffle", description: "Toggle shuffle mode" },
  {
    name: "loop",
    description: "Set loop mode",
    options: [
      {
        name: "mode",
        description: "Loop mode",
        type: 3,
        required: true,
        choices: [
          { name: "Off", value: "none" },
          { name: "Track", value: "track" },
          { name: "Queue", value: "queue" },
        ],
      },
    ],
  },
  
  // Moderation Commands
  {
    name: "kick",
    description: "Kick a user from the server",
    default_member_permissions: "2",
    options: [
      { name: "user", description: "The user to kick", type: 6, required: true },
      { name: "reason", description: "Reason for kicking", type: 3, required: false },
    ],
  },
  {
    name: "ban",
    description: "Ban a user from the server",
    default_member_permissions: "4",
    options: [
      { name: "user", description: "The user to ban", type: 6, required: true },
      { name: "reason", description: "Reason for banning", type: 3, required: false },
      { name: "delete_messages", description: "Days of messages to delete (0-7)", type: 4, required: false, min_value: 0, max_value: 7 },
    ],
  },
  {
    name: "unban",
    description: "Unban a user from the server",
    default_member_permissions: "4",
    options: [
      { name: "user_id", description: "The user ID to unban", type: 3, required: true },
    ],
  },
  {
    name: "mute",
    description: "Timeout a user (mute)",
    default_member_permissions: "1099511627776",
    options: [
      { name: "user", description: "The user to mute", type: 6, required: true },
      { name: "duration", description: "Duration in minutes", type: 4, required: true, min_value: 1, max_value: 40320 },
      { name: "reason", description: "Reason for muting", type: 3, required: false },
    ],
  },
  {
    name: "unmute",
    description: "Remove timeout from a user",
    default_member_permissions: "1099511627776",
    options: [
      { name: "user", description: "The user to unmute", type: 6, required: true },
    ],
  },
  {
    name: "warn",
    description: "Warn a user",
    default_member_permissions: "2",
    options: [
      { name: "user", description: "The user to warn", type: 6, required: true },
      { name: "reason", description: "Reason for warning", type: 3, required: true },
    ],
  },
  {
    name: "warnings",
    description: "View warnings for a user",
    default_member_permissions: "2",
    options: [
      { name: "user", description: "The user to check", type: 6, required: true },
    ],
  },
  {
    name: "clearwarnings",
    description: "Clear all warnings for a user",
    default_member_permissions: "4",
    options: [
      { name: "user", description: "The user to clear warnings for", type: 6, required: true },
    ],
  },
  {
    name: "purge",
    description: "Delete multiple messages",
    default_member_permissions: "8192",
    options: [
      { name: "amount", description: "Number of messages to delete (1-100)", type: 4, required: true, min_value: 1, max_value: 100 },
      { name: "user", description: "Only delete messages from this user", type: 6, required: false },
    ],
  },
  {
    name: "slowmode",
    description: "Set channel slowmode",
    default_member_permissions: "16",
    options: [
      { name: "seconds", description: "Slowmode delay in seconds (0 to disable)", type: 4, required: true, min_value: 0, max_value: 21600 },
    ],
  },
  
  // Utility Commands
  { name: "help", description: "Show available NexusBot commands" },
  {
    name: "settings",
    description: "View or change bot settings for this server",
    default_member_permissions: "32",
  },
  {
    name: "userinfo",
    description: "Get information about a user",
    options: [
      { name: "user", description: "The user to get info for", type: 6, required: false },
    ],
  },
  { name: "serverinfo", description: "Get information about the server" },
  {
    name: "avatar",
    description: "Get a user's avatar",
    options: [
      { name: "user", description: "The user to get avatar for", type: 6, required: false },
    ],
  },
  { name: "ping", description: "Check bot latency" },
];

// Register slash commands
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  
  try {
    console.log('Registering slash commands...');
    
    // Register globally (takes up to 1 hour to propagate)
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands }
    );
    
    console.log(`Successfully registered ${commands.length} global commands`);
    
    // Also register for each guild immediately (instant)
    for (const guild of client.guilds.cache.values()) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guild.id),
          { body: commands }
        );
        console.log(`Registered commands for guild: ${guild.name}`);
      } catch (err) {
        console.error(`Failed to register commands for guild ${guild.name}:`, err.message);
      }
    }
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// AI Chat function
async function getAIResponse(message, personality) {
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: personality },
          { role: 'user', content: message },
        ],
      }),
    });

    if (!response.ok) {
      console.error('AI API error:', response.status);
      return "Sorry, I couldn't process that request.";
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "I don't have a response for that.";
  } catch (error) {
    console.error('AI error:', error);
    return "An error occurred while processing your request.";
  }
}

// Get server config from database
async function getServerConfig(guildId) {
  const { data: server } = await supabase
    .from('servers')
    .select('id')
    .eq('discord_server_id', guildId)
    .maybeSingle();

  if (!server) return null;

  const { data: config } = await supabase
    .from('bot_configs')
    .select('*')
    .eq('server_id', server.id)
    .maybeSingle();

  return { serverId: server.id, config };
}

// Get or create music queue
async function getMusicQueue(serverId) {
  const { data } = await supabase
    .from('music_queues')
    .select('*')
    .eq('server_id', serverId)
    .maybeSingle();

  return data;
}

// Update music queue in database
async function updateMusicQueue(serverId, updates) {
  await supabase
    .from('music_queues')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('server_id', serverId);
}

// Play audio in voice channel
async function playTrack(guildId, serverId, track) {
  const connection = getVoiceConnection(guildId);
  if (!connection) {
    console.log('No voice connection for guild:', guildId);
    return;
  }

  let player = players.get(guildId);
  if (!player) {
    player = createAudioPlayer();
    players.set(guildId, player);

    player.on(AudioPlayerStatus.Idle, async () => {
      console.log('Player idle, playing next track...');
      await playNextTrack(guildId, serverId);
    });

    player.on('error', error => {
      console.error('Audio player error:', error);
    });

    connection.subscribe(player);
  }

  try {
    let stream;
    const url = track.url || track.title;

    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const info = await play.video_info(url);
      stream = await play.stream(info.video_details.url);
    } else if (url.includes('spotify.com')) {
      const search = await play.search(track.title, { limit: 1 });
      if (search.length > 0) {
        stream = await play.stream(search[0].url);
      }
    } else {
      const search = await play.search(url, { limit: 1 });
      if (search.length > 0) {
        stream = await play.stream(search[0].url);
      }
    }

    if (stream) {
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
      });
      player.play(resource);
      
      await updateMusicQueue(serverId, { 
        is_playing: true,
        current_track: track,
      });

      console.log('Now playing:', track.title);
    }
  } catch (error) {
    console.error('Error playing track:', error);
    await playNextTrack(guildId, serverId);
  }
}

// Play next track in queue
async function playNextTrack(guildId, serverId) {
  const queue = await getMusicQueue(serverId);
  if (!queue || !queue.tracks || queue.tracks.length === 0) {
    await updateMusicQueue(serverId, { is_playing: false, current_track: null });
    return;
  }

  let nextIndex = (queue.current_index || 0) + 1;
  
  if (queue.loop_mode === 'track') {
    nextIndex = queue.current_index || 0;
  } else if (queue.loop_mode === 'queue' && nextIndex >= queue.tracks.length) {
    nextIndex = 0;
  } else if (nextIndex >= queue.tracks.length) {
    await updateMusicQueue(serverId, { is_playing: false, current_track: null });
    return;
  }

  if (queue.shuffle_enabled) {
    nextIndex = Math.floor(Math.random() * queue.tracks.length);
  }

  await updateMusicQueue(serverId, { current_index: nextIndex });
  await playTrack(guildId, serverId, queue.tracks[nextIndex]);
}

// Join voice channel
async function joinChannel(channel, serverId) {
  try {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    await updateMusicQueue(serverId, { voice_channel_id: channel.id });

    console.log('Joined voice channel:', channel.name);
    return connection;
  } catch (error) {
    console.error('Error joining voice channel:', error);
    throw error;
  }
}

// Log command to database
async function logCommand(serverId, userId, username, command, commandType) {
  try {
    await supabase.from('command_logs').insert({
      server_id: serverId,
      user_discord_id: userId,
      username: username,
      command: command,
      command_type: commandType,
    });
  } catch (error) {
    console.error('Error logging command:', error);
  }
}

// Handle slash command interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, guild, user, member, channel } = interaction;
  const serverData = await getServerConfig(guild?.id);

  console.log(`Slash command: /${commandName} by ${user.username}`);

  try {
    switch (commandName) {
      // AI Commands
      case 'chat':
      case 'ask': {
        await interaction.deferReply();
        const message = options.getString('message');
        const personality = serverData?.config?.ai_personality || 
          "You are NexusBot, a friendly Discord bot. Be helpful, concise, and engaging.";
        const response = await getAIResponse(message, personality);
        await interaction.editReply(response.substring(0, 2000));
        if (serverData?.serverId) {
          await logCommand(serverData.serverId, user.id, user.username, commandName, 'ai');
        }
        break;
      }

      case 'imagine': {
        await interaction.deferReply();
        const prompt = options.getString('prompt');
        // Image generation placeholder - would need actual implementation
        await interaction.editReply(`🎨 Image generation for: "${prompt}" - This feature requires additional API integration.`);
        break;
      }

      // Music Commands
      case 'play': {
        await interaction.deferReply();
        const query = options.getString('query');
        
        if (!member?.voice?.channel) {
          await interaction.editReply('❌ You need to be in a voice channel!');
          return;
        }

        if (!serverData?.serverId) {
          await interaction.editReply('❌ Server not configured. Please set up the bot first.');
          return;
        }

        // Join voice channel if not already connected
        let connection = getVoiceConnection(guild.id);
        if (!connection) {
          connection = await joinChannel(member.voice.channel, serverData.serverId);
        }

        // Search for the track
        const search = await play.search(query, { limit: 1 });
        if (search.length === 0) {
          await interaction.editReply('❌ No results found for your query.');
          return;
        }

        const track = {
          title: search[0].title,
          url: search[0].url,
          duration: search[0].durationInSec,
          thumbnail: search[0].thumbnails[0]?.url,
          requested_by: user.username,
        };

        // Add to queue
        const queue = await getMusicQueue(serverData.serverId);
        const tracks = queue?.tracks || [];
        tracks.push(track);

        await supabase.from('music_queues').upsert({
          server_id: serverData.serverId,
          tracks: tracks,
          current_index: queue?.current_index || 0,
          is_playing: queue?.is_playing || false,
          updated_at: new Date().toISOString(),
        });

        // If not playing, start playing
        if (!queue?.is_playing) {
          await playTrack(guild.id, serverData.serverId, track);
        }

        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🎵 Added to Queue')
          .setDescription(`**${track.title}**`)
          .setThumbnail(track.thumbnail)
          .addFields({ name: 'Requested by', value: user.username, inline: true });

        await interaction.editReply({ embeds: [embed] });
        await logCommand(serverData.serverId, user.id, user.username, `play ${query}`, 'music');
        break;
      }

      case 'skip': {
        if (!serverData?.serverId) {
          await interaction.reply('❌ Server not configured.');
          return;
        }
        await playNextTrack(guild.id, serverData.serverId);
        await interaction.reply('⏭️ Skipped to next track!');
        break;
      }

      case 'pause': {
        const player = players.get(guild.id);
        if (player) {
          player.pause();
          await updateMusicQueue(serverData?.serverId, { is_playing: false });
          await interaction.reply('⏸️ Paused!');
        } else {
          await interaction.reply('❌ Nothing is playing.');
        }
        break;
      }

      case 'resume': {
        const player = players.get(guild.id);
        if (player) {
          player.unpause();
          await updateMusicQueue(serverData?.serverId, { is_playing: true });
          await interaction.reply('▶️ Resumed!');
        } else {
          await interaction.reply('❌ Nothing to resume.');
        }
        break;
      }

      case 'stop': {
        const player = players.get(guild.id);
        const connection = getVoiceConnection(guild.id);
        if (player) player.stop();
        if (connection) connection.destroy();
        players.delete(guild.id);
        if (serverData?.serverId) {
          await updateMusicQueue(serverData.serverId, { 
            is_playing: false, 
            current_track: null,
            tracks: [],
            current_index: 0 
          });
        }
        await interaction.reply('⏹️ Stopped and cleared queue!');
        break;
      }

      case 'queue': {
        const queue = await getMusicQueue(serverData?.serverId);
        if (!queue?.tracks?.length) {
          await interaction.reply('📭 Queue is empty!');
          return;
        }
        const trackList = queue.tracks.slice(0, 10).map((t, i) => 
          `${i + 1}. ${t.title} - requested by ${t.requested_by}`
        ).join('\n');
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🎵 Music Queue')
          .setDescription(trackList)
          .setFooter({ text: `${queue.tracks.length} tracks in queue` });
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'nowplaying': {
        const queue = await getMusicQueue(serverData?.serverId);
        if (!queue?.current_track) {
          await interaction.reply('🔇 Nothing is currently playing.');
          return;
        }
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🎵 Now Playing')
          .setDescription(`**${queue.current_track.title}**`)
          .setThumbnail(queue.current_track.thumbnail)
          .addFields({ name: 'Requested by', value: queue.current_track.requested_by || 'Unknown', inline: true });
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'volume': {
        const level = options.getInteger('level');
        if (serverData?.serverId) {
          await updateMusicQueue(serverData.serverId, { volume: level });
        }
        await interaction.reply(`🔊 Volume set to ${level}%`);
        break;
      }

      case 'shuffle': {
        const queue = await getMusicQueue(serverData?.serverId);
        const newShuffle = !queue?.shuffle_enabled;
        await updateMusicQueue(serverData?.serverId, { shuffle_enabled: newShuffle });
        await interaction.reply(`🔀 Shuffle ${newShuffle ? 'enabled' : 'disabled'}!`);
        break;
      }

      case 'loop': {
        const mode = options.getString('mode');
        await updateMusicQueue(serverData?.serverId, { loop_mode: mode });
        const modeText = { none: 'Off', track: 'Track', queue: 'Queue' };
        await interaction.reply(`🔁 Loop mode: ${modeText[mode]}`);
        break;
      }

      // Moderation Commands
      case 'kick': {
        const targetUser = options.getUser('user');
        const reason = options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(targetUser.id);
        
        if (!targetMember.kickable) {
          await interaction.reply('❌ I cannot kick this user.');
          return;
        }
        
        await targetMember.kick(reason);
        await interaction.reply(`✅ Kicked ${targetUser.tag} - Reason: ${reason}`);
        
        if (serverData?.serverId) {
          await supabase.from('moderation_logs').insert({
            server_id: serverData.serverId,
            action: 'kick',
            target_discord_id: targetUser.id,
            target_username: targetUser.username,
            moderator_discord_id: user.id,
            moderator_username: user.username,
            reason: reason,
          });
        }
        break;
      }

      case 'ban': {
        const targetUser = options.getUser('user');
        const reason = options.getString('reason') || 'No reason provided';
        const deleteMessages = options.getInteger('delete_messages') || 0;
        const targetMember = await guild.members.fetch(targetUser.id);
        
        if (!targetMember.bannable) {
          await interaction.reply('❌ I cannot ban this user.');
          return;
        }
        
        await targetMember.ban({ reason, deleteMessageDays: deleteMessages });
        await interaction.reply(`✅ Banned ${targetUser.tag} - Reason: ${reason}`);
        
        if (serverData?.serverId) {
          await supabase.from('moderation_logs').insert({
            server_id: serverData.serverId,
            action: 'ban',
            target_discord_id: targetUser.id,
            target_username: targetUser.username,
            moderator_discord_id: user.id,
            moderator_username: user.username,
            reason: reason,
          });
        }
        break;
      }

      case 'unban': {
        const userId = options.getString('user_id');
        await guild.members.unban(userId);
        await interaction.reply(`✅ Unbanned user ID: ${userId}`);
        break;
      }

      case 'mute': {
        const targetUser = options.getUser('user');
        const duration = options.getInteger('duration');
        const reason = options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(targetUser.id);
        
        await targetMember.timeout(duration * 60 * 1000, reason);
        await interaction.reply(`✅ Muted ${targetUser.tag} for ${duration} minutes - Reason: ${reason}`);
        
        if (serverData?.serverId) {
          await supabase.from('moderation_logs').insert({
            server_id: serverData.serverId,
            action: 'mute',
            target_discord_id: targetUser.id,
            target_username: targetUser.username,
            moderator_discord_id: user.id,
            moderator_username: user.username,
            reason: reason,
            duration_minutes: duration,
          });
        }
        break;
      }

      case 'unmute': {
        const targetUser = options.getUser('user');
        const targetMember = await guild.members.fetch(targetUser.id);
        await targetMember.timeout(null);
        await interaction.reply(`✅ Unmuted ${targetUser.tag}`);
        break;
      }

      case 'warn': {
        const targetUser = options.getUser('user');
        const reason = options.getString('reason');
        
        if (serverData?.serverId) {
          await supabase.from('user_warnings').insert({
            server_id: serverData.serverId,
            user_discord_id: targetUser.id,
            user_username: targetUser.username,
            warned_by_discord_id: user.id,
            warned_by_username: user.username,
            reason: reason,
          });
        }
        await interaction.reply(`⚠️ Warned ${targetUser.tag} - Reason: ${reason}`);
        break;
      }

      case 'warnings': {
        const targetUser = options.getUser('user');
        const { data: warnings } = await supabase
          .from('user_warnings')
          .select('*')
          .eq('server_id', serverData?.serverId)
          .eq('user_discord_id', targetUser.id)
          .eq('active', true);
        
        if (!warnings?.length) {
          await interaction.reply(`✅ ${targetUser.tag} has no active warnings.`);
          return;
        }
        
        const warningList = warnings.map((w, i) => 
          `${i + 1}. ${w.reason} - by ${w.warned_by_username}`
        ).join('\n');
        
        const embed = new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle(`⚠️ Warnings for ${targetUser.tag}`)
          .setDescription(warningList)
          .setFooter({ text: `${warnings.length} active warnings` });
        
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'clearwarnings': {
        const targetUser = options.getUser('user');
        await supabase
          .from('user_warnings')
          .update({ active: false })
          .eq('server_id', serverData?.serverId)
          .eq('user_discord_id', targetUser.id);
        await interaction.reply(`✅ Cleared all warnings for ${targetUser.tag}`);
        break;
      }

      case 'purge': {
        const amount = options.getInteger('amount');
        const targetUser = options.getUser('user');
        
        let messages;
        if (targetUser) {
          const fetched = await channel.messages.fetch({ limit: 100 });
          messages = fetched.filter(m => m.author.id === targetUser.id).first(amount);
        } else {
          messages = await channel.messages.fetch({ limit: amount });
        }
        
        await channel.bulkDelete(messages, true);
        const reply = await interaction.reply(`🗑️ Deleted ${messages.size} messages.`);
        setTimeout(() => reply.delete().catch(() => {}), 3000);
        break;
      }

      case 'slowmode': {
        const seconds = options.getInteger('seconds');
        await channel.setRateLimitPerUser(seconds);
        await interaction.reply(`⏱️ Slowmode set to ${seconds} seconds.`);
        break;
      }

      // Utility Commands
      case 'help': {
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🤖 NexusBot Commands')
          .setDescription('Use `/command` or `@NexusBot command` to use these commands!')
          .addFields(
            { name: '🤖 AI', value: '`chat`, `ask`, `imagine`', inline: true },
            { name: '🎵 Music', value: '`play`, `skip`, `pause`, `resume`, `stop`, `queue`, `nowplaying`, `volume`, `shuffle`, `loop`', inline: true },
            { name: '🛡️ Moderation', value: '`kick`, `ban`, `unban`, `mute`, `unmute`, `warn`, `warnings`, `clearwarnings`, `purge`, `slowmode`', inline: true },
            { name: '🔧 Utility', value: '`help`, `settings`, `userinfo`, `serverinfo`, `avatar`, `ping`', inline: true }
          )
          .setFooter({ text: 'Tip: Mention me with a message to chat with AI!' });
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'settings': {
        const config = serverData?.config;
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('⚙️ Bot Settings')
          .addFields(
            { name: 'Prefix', value: config?.prefix || '!', inline: true },
            { name: 'AI Enabled', value: config?.ai_enabled ? '✅' : '❌', inline: true },
            { name: 'Music Enabled', value: config?.music_enabled ? '✅' : '❌', inline: true },
            { name: 'Moderation', value: config?.moderation_enabled ? '✅' : '❌', inline: true }
          )
          .setFooter({ text: 'Configure settings on the dashboard' });
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'userinfo': {
        const targetUser = options.getUser('user') || user;
        const targetMember = await guild.members.fetch(targetUser.id);
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`👤 ${targetUser.tag}`)
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
          .addFields(
            { name: 'ID', value: targetUser.id, inline: true },
            { name: 'Joined Server', value: targetMember.joinedAt?.toDateString() || 'Unknown', inline: true },
            { name: 'Account Created', value: targetUser.createdAt.toDateString(), inline: true },
            { name: 'Roles', value: targetMember.roles.cache.map(r => r.name).slice(0, 10).join(', ') || 'None' }
          );
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'serverinfo': {
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`📊 ${guild.name}`)
          .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
          .addFields(
            { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
            { name: 'Members', value: `${guild.memberCount}`, inline: true },
            { name: 'Created', value: guild.createdAt.toDateString(), inline: true },
            { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
            { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
            { name: 'Boosts', value: `${guild.premiumSubscriptionCount || 0}`, inline: true }
          );
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'avatar': {
        const targetUser = options.getUser('user') || user;
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`🖼️ ${targetUser.tag}'s Avatar`)
          .setImage(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }));
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'ping': {
        const latency = Date.now() - interaction.createdTimestamp;
        await interaction.reply(`🏓 Pong! Latency: ${latency}ms | API: ${client.ws.ping}ms`);
        break;
      }

      default:
        await interaction.reply('❓ Unknown command.');
    }
  } catch (error) {
    console.error(`Error handling /${commandName}:`, error);
    const errorMessage = '❌ An error occurred while processing this command.';
    if (interaction.deferred) {
      await interaction.editReply(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// Parse @mention commands (text-based)
function parseCommand(content) {
  const parts = content.trim().split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1);
  return { command, args, fullArgs: args.join(' ') };
}

// Handle @mentions with command support
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.mentions.has(client.user)) return;

  const content = message.content.replace(/<@!?\d+>/g, '').trim();
  if (!content) {
    message.reply("Hey! How can I help you? Use commands like `@NexusBot help` or just chat with me!");
    return;
  }

  const { command, args, fullArgs } = parseCommand(content);
  const serverData = await getServerConfig(message.guild?.id);
  
  console.log(`@mention command: ${command} by ${message.author.username}`);

  // Check if it's a known command
  const knownCommands = ['help', 'ping', 'play', 'skip', 'pause', 'resume', 'stop', 'queue', 
    'nowplaying', 'volume', 'shuffle', 'loop', 'kick', 'ban', 'mute', 'unmute', 'warn', 
    'warnings', 'clearwarnings', 'purge', 'slowmode', 'userinfo', 'serverinfo', 'avatar',
    'chat', 'ask', 'imagine', 'settings', 'unban'];

  if (knownCommands.includes(command)) {
    // Handle as command
    try {
      switch (command) {
        case 'help': {
          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🤖 NexusBot Commands')
            .setDescription('Use `/command` or `@NexusBot command` to use these commands!')
            .addFields(
              { name: '🤖 AI', value: '`chat`, `ask`, `imagine`', inline: true },
              { name: '🎵 Music', value: '`play`, `skip`, `pause`, `resume`, `stop`, `queue`, `nowplaying`, `volume`, `shuffle`, `loop`', inline: true },
              { name: '🛡️ Moderation', value: '`kick`, `ban`, `unban`, `mute`, `unmute`, `warn`, `warnings`, `clearwarnings`, `purge`, `slowmode`', inline: true },
              { name: '🔧 Utility', value: '`help`, `settings`, `userinfo`, `serverinfo`, `avatar`, `ping`', inline: true }
            )
            .setFooter({ text: 'Tip: Mention me with a message to chat with AI!' });
          await message.reply({ embeds: [embed] });
          break;
        }

        case 'ping': {
          const latency = Date.now() - message.createdTimestamp;
          await message.reply(`🏓 Pong! Latency: ${latency}ms | API: ${client.ws.ping}ms`);
          break;
        }

        case 'chat':
        case 'ask': {
          if (!fullArgs) {
            await message.reply('Please provide a message! Example: `@NexusBot chat Hello!`');
            return;
          }
          await message.channel.sendTyping();
          const personality = serverData?.config?.ai_personality || 
            "You are NexusBot, a friendly Discord bot. Be helpful, concise, and engaging.";
          const response = await getAIResponse(fullArgs, personality);
          await message.reply(response.substring(0, 2000));
          break;
        }

        case 'play': {
          if (!fullArgs) {
            await message.reply('Please provide a song! Example: `@NexusBot play Never Gonna Give You Up`');
            return;
          }
          if (!message.member?.voice?.channel) {
            await message.reply('❌ You need to be in a voice channel!');
            return;
          }
          if (!serverData?.serverId) {
            await message.reply('❌ Server not configured.');
            return;
          }

          let connection = getVoiceConnection(message.guild.id);
          if (!connection) {
            connection = await joinChannel(message.member.voice.channel, serverData.serverId);
          }

          const search = await play.search(fullArgs, { limit: 1 });
          if (search.length === 0) {
            await message.reply('❌ No results found.');
            return;
          }

          const track = {
            title: search[0].title,
            url: search[0].url,
            duration: search[0].durationInSec,
            thumbnail: search[0].thumbnails[0]?.url,
            requested_by: message.author.username,
          };

          const queue = await getMusicQueue(serverData.serverId);
          const tracks = queue?.tracks || [];
          tracks.push(track);

          await supabase.from('music_queues').upsert({
            server_id: serverData.serverId,
            tracks: tracks,
            current_index: queue?.current_index || 0,
            is_playing: queue?.is_playing || false,
            updated_at: new Date().toISOString(),
          });

          if (!queue?.is_playing) {
            await playTrack(message.guild.id, serverData.serverId, track);
          }

          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎵 Added to Queue')
            .setDescription(`**${track.title}**`)
            .setThumbnail(track.thumbnail);
          await message.reply({ embeds: [embed] });
          break;
        }

        case 'skip':
          if (serverData?.serverId) {
            await playNextTrack(message.guild.id, serverData.serverId);
            await message.reply('⏭️ Skipped!');
          }
          break;

        case 'pause': {
          const player = players.get(message.guild.id);
          if (player) {
            player.pause();
            await message.reply('⏸️ Paused!');
          } else {
            await message.reply('❌ Nothing is playing.');
          }
          break;
        }

        case 'resume': {
          const player = players.get(message.guild.id);
          if (player) {
            player.unpause();
            await message.reply('▶️ Resumed!');
          } else {
            await message.reply('❌ Nothing to resume.');
          }
          break;
        }

        case 'stop': {
          const player = players.get(message.guild.id);
          const connection = getVoiceConnection(message.guild.id);
          if (player) player.stop();
          if (connection) connection.destroy();
          players.delete(message.guild.id);
          await message.reply('⏹️ Stopped!');
          break;
        }

        case 'queue': {
          const queue = await getMusicQueue(serverData?.serverId);
          if (!queue?.tracks?.length) {
            await message.reply('📭 Queue is empty!');
            return;
          }
          const trackList = queue.tracks.slice(0, 10).map((t, i) => 
            `${i + 1}. ${t.title}`
          ).join('\n');
          await message.reply(`🎵 **Queue:**\n${trackList}`);
          break;
        }

        case 'nowplaying': {
          const queue = await getMusicQueue(serverData?.serverId);
          if (queue?.current_track) {
            await message.reply(`🎵 Now playing: **${queue.current_track.title}**`);
          } else {
            await message.reply('🔇 Nothing is playing.');
          }
          break;
        }

        case 'userinfo': {
          const targetUser = message.mentions.users.filter(u => u.id !== client.user.id).first() || message.author;
          const targetMember = await message.guild.members.fetch(targetUser.id);
          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`👤 ${targetUser.tag}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
              { name: 'ID', value: targetUser.id, inline: true },
              { name: 'Joined', value: targetMember.joinedAt?.toDateString() || 'Unknown', inline: true }
            );
          await message.reply({ embeds: [embed] });
          break;
        }

        case 'serverinfo': {
          const guild = message.guild;
          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📊 ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
              { name: 'Members', value: `${guild.memberCount}`, inline: true },
              { name: 'Created', value: guild.createdAt.toDateString(), inline: true }
            );
          await message.reply({ embeds: [embed] });
          break;
        }

        case 'avatar': {
          const targetUser = message.mentions.users.filter(u => u.id !== client.user.id).first() || message.author;
          await message.reply(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }));
          break;
        }

        default:
          // For moderation commands, inform about slash commands
          if (['kick', 'ban', 'mute', 'unmute', 'warn', 'warnings', 'clearwarnings', 'purge', 'slowmode', 'unban'].includes(command)) {
            await message.reply(`⚠️ For security, moderation commands require slash commands. Use \`/${command}\` instead.`);
          }
      }
    } catch (error) {
      console.error('Error handling @mention command:', error);
      await message.reply('❌ An error occurred.');
    }
  } else {
    // Not a command - treat as AI chat
    await message.channel.sendTyping();
    const personality = serverData?.config?.ai_personality || 
      "You are NexusBot, a friendly Discord bot. Be helpful, concise, and engaging.";
    const response = await getAIResponse(content, personality);
    
    if (response.length > 2000) {
      const chunks = response.match(/.{1,2000}/g) || [];
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } else {
      await message.reply(response);
    }

    if (serverData?.serverId) {
      await logCommand(serverData.serverId, message.author.id, message.author.username, '@mention', 'ai');
    }
  }
});

// Handle DMs
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.guild) return;

  const content = message.content.trim();
  if (!content) return;

  await message.channel.sendTyping();

  const personality = "You are NexusBot, a friendly Discord bot. Be helpful, concise, and engaging.";
  const response = await getAIResponse(content, personality);

  if (response.length > 2000) {
    const chunks = response.match(/.{1,2000}/g) || [];
    for (const chunk of chunks) {
      await message.reply(chunk);
    }
  } else {
    await message.reply(response);
  }
});

// Handle voice state updates
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  if (!oldState.channel && newState.channel) {
    const serverData = await getServerConfig(newState.guild.id);
    if (!serverData) return;

    const queue = await getMusicQueue(serverData.serverId);
    
    if (queue && queue.tracks && queue.tracks.length > 0 && !getVoiceConnection(newState.guild.id)) {
      const userTrack = queue.tracks.find(t => t.requested_by === newState.member.user.username);
      if (userTrack) {
        await joinChannel(newState.channel, serverData.serverId);
        await playTrack(newState.guild.id, serverData.serverId, queue.tracks[queue.current_index || 0]);
      }
    }
  }
});

// Subscribe to database changes
async function subscribeToQueueChanges() {
  const channel = supabase
    .channel('music-queue-changes')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'music_queues',
      },
      async (payload) => {
        const queue = payload.new;
        const oldQueue = payload.old;
        
        console.log('Queue update received:', { 
          is_playing: queue.is_playing, 
          voice_channel_id: queue.voice_channel_id,
          has_current_track: !!queue.current_track,
          tracks_count: queue.tracks?.length || 0
        });
        
        const { data: server } = await supabase
          .from('servers')
          .select('discord_server_id')
          .eq('id', queue.server_id)
          .maybeSingle();

        if (!server) {
          console.log('Server not found for queue:', queue.server_id);
          return;
        }

        const guildId = server.discord_server_id;
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
          console.log('Guild not in cache:', guildId);
          return;
        }

        const connection = getVoiceConnection(guildId);
        const player = players.get(guildId);

        // Handle play request from dashboard
        if (queue.is_playing && queue.current_track) {
          // Check if we need to join a voice channel
          if (!connection) {
            let voiceChannel = null;
            
            // First priority: use specified voice channel from dashboard
            if (queue.voice_channel_id) {
              voiceChannel = guild.channels.cache.get(queue.voice_channel_id);
              console.log('Using specified voice channel:', voiceChannel?.name);
            }
            
            // Fallback: find any voice channel with members
            if (!voiceChannel) {
              voiceChannel = guild.channels.cache.find(
                c => c.type === 2 && c.members.size > 0
              );
              console.log('Fallback to channel with members:', voiceChannel?.name);
            }
            
            // Last resort: find the first voice channel
            if (!voiceChannel) {
              voiceChannel = guild.channels.cache.find(c => c.type === 2);
              console.log('Last resort - first voice channel:', voiceChannel?.name);
            }
            
            if (voiceChannel) {
              try {
                console.log(`Joining voice channel: ${voiceChannel.name} (${voiceChannel.id})`);
                await joinChannel(voiceChannel, queue.server_id);
                
                // Small delay to ensure connection is ready
                await new Promise(resolve => setTimeout(resolve, 500));
                
                console.log('Playing track:', queue.current_track.title);
                await playTrack(guildId, queue.server_id, queue.current_track);
              } catch (error) {
                console.error('Failed to join/play:', error);
              }
            } else {
              console.log('No voice channel available to join');
            }
          } else {
            // Already connected - handle play/resume/track change
            const currentPlayer = players.get(guildId);
            
            // Check if track changed
            const oldTrack = oldQueue?.current_track;
            const newTrack = queue.current_track;
            const trackChanged = (!oldTrack && newTrack) || 
              (oldTrack && newTrack && oldTrack.url !== newTrack.url);
            
            if (trackChanged) {
              console.log('Track changed, playing new track:', newTrack.title);
              await playTrack(guildId, queue.server_id, newTrack);
            } else if (currentPlayer && currentPlayer.state.status === AudioPlayerStatus.Paused) {
              console.log('Resuming playback');
              currentPlayer.unpause();
            } else if (!currentPlayer || currentPlayer.state.status === AudioPlayerStatus.Idle) {
              console.log('Player idle, starting playback');
              await playTrack(guildId, queue.server_id, queue.current_track);
            }
          }
        } else if (!queue.is_playing && player) {
          // Handle pause request
          if (player.state.status === AudioPlayerStatus.Playing) {
            console.log('Pausing playback');
            player.pause();
          }
        }
      }
    )
    .subscribe();

  console.log('Subscribed to queue changes');
}

// Bot ready
client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  
  c.user.setActivity('music & chatting | /help', { type: ActivityType.Playing });

  // Register slash commands
  await registerCommands();

  // Subscribe to real-time updates
  await subscribeToQueueChanges();
});

// Login
client.login(process.env.DISCORD_BOT_TOKEN);
