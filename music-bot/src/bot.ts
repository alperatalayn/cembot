import Discord, { Interaction, GuildMember, Snowflake } from 'discord.js';
const { commands, ali, imam, asim, prefix, help } = require('../commands.json');
var { google } = require('googleapis');
import {
	AudioPlayerStatus,
	AudioResource,
	entersState,
	joinVoiceChannel,
	VoiceConnectionStatus,
} from '@discordjs/voice';
import { Track } from './music/track';
import { MusicSubscription } from './music/subscription';
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const { token, key } = require('../auth.json');
var youtube = google.youtube({
	version: 'v3',
	auth: key,
});
const subscriptions = new Map<Snowflake, MusicSubscription>();
const client = new Discord.Client({ intents: ['GUILD_VOICE_STATES', 'GUILD_MESSAGES', 'GUILDS'] });
function getRandomInt(max: number) {
	return Math.floor(Math.random() * max);
}
function searchVideo(query: any) {
	return new Promise((resolve, reject) => {
		youtube.search.list(
			{
				part: 'snippet',
				q: query,
			},
			function (err: String, data: any) {
				if (err) {
					reject(err);
					return;
				}
				// use better check for playlistId here
				var result = null;
				if (data && data.data && data.data.items[0]) {
					result = 'https://www.youtube.com/watch?v=' + data.data.items[0].id.videoId;
				}
				resolve(result);
			},
		);
	});
}
client.on('ready', () => console.log('Ready!'));

// This contains the setup code for creating slash commands in a guild. The owner of the bot can send "!deploy" to create them.
client.on('messageCreate', async (message) => {
	if (!message.guild) return;
	if (message.author.bot) return;
	if (!client.application?.owner) await client.application?.fetch();

	let subscription = subscriptions.get(message.guild.id);
	for (var i = 0; i < commands.length; i += 1) {
		if (message.content.toLowerCase() === commands[i].name) {
			await message.reply(commands[i].value);
		}
	}
	if (message.author.username === 'AwesomeKeskin' || message.author.username === 'Baran Ünal') {
		var i = getRandomInt(asim.length);
		await message.reply(asim[i].value);
	}
	if (message.content.toLowerCase() === 'ali') {
		var i = getRandomInt(ali.length);
		await message.reply(ali[i].value);
	} else if (
		message.content.toLowerCase() === '12 imam' ||
		message.content.toLowerCase() === 'on iki imam' ||
		message.content.toLowerCase() === '12imam'
	) {
		var i = getRandomInt(imam.length);
		await message.reply(imam[i].value);
	} else if (message.content.startsWith(`${prefix}play `) || message.content.startsWith(`${prefix}p `)) {
		const query = message.content.split(/(?<=^\S+)\s/)[1];
		var url: any;
		var res = query.match(
			/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g,
		);
		if (res !== null) {
			url = query;
		} else {
			url = await searchVideo(query);
		}
		// If a connection to the guild doesn't already exist and the user is in a voice channel, join that channel
		// and create a subscription.
		if (!subscription) {
			if (message.member instanceof GuildMember && message.member.voice.channel) {
				const channel = message.member.voice.channel;
				subscription = new MusicSubscription(
					joinVoiceChannel({
						channelId: channel.id,
						guildId: channel.guild.id,
						adapterCreator: channel.guild.voiceAdapterCreator,
					}),
				);
				subscription.voiceConnection.on('error', console.warn);
				subscriptions.set(message.guild.id, subscription);
			}
		}

		// If there is no subscription, tell the user they need to join a channel.
		if (!subscription) {
			await message.reply('Join a voice channel and then try that again!');
			return;
		}

		// Make sure the connection is ready before processing the user's request
		try {
			await entersState(subscription.voiceConnection, VoiceConnectionStatus.Ready, 20e3);
		} catch (error) {
			console.warn(error);
			await message.reply('Failed to join voice channel within 20 seconds, please try again later!');
			return;
		}

		try {
			const track = await Track.from(url, {
				onStart() {},
				onFinish() {
					if (subscription?.loop) {
						subscription.enqueue(track);
					}
				},
				onError(error) {
					console.warn(error);
					message.reply({ content: `Error: ${error.message}` }).catch(console.warn);
				},
			});
			// Enqueue the track and reply a success message to the user
			subscription.enqueue(track);
			await message.reply(`Enqueued **${track.title}**`);
		} catch (error) {
			console.warn(error);
			await message.reply('Failed to play track, please try again later!');
		}
	} else if (message.content.startsWith(`${prefix}skip`)) {
		if (subscription) {
			// Calling .stop() on an AudioPlayer causes it to transition into the Idle state. Because of a state transition
			// listener defined in music/subscription.ts, transitions into the Idle state mean the next track from the queue
			// will be loaded and played.
			subscription.audioPlayer.stop();
			await message.reply('Skipped song!');
		} else {
			await message.reply('Not playing in this server!');
		}
	} else if (message.content.startsWith(`${prefix}queue`)) {
		// Print out the current queue, including up to the next 5 tracks to be played.
		if (subscription) {
			const current =
				subscription.audioPlayer.state.status === AudioPlayerStatus.Idle
					? `Nothing is currently playing!`
					: `Playing **${(subscription.audioPlayer.state.resource as AudioResource<Track>).metadata.title}**`;

			const queue = subscription.queue.map((track, index) => `${index + 1}) ${track.title}`).join('\n');

			await message.reply(`${current}\n\n${queue}`);
		} else {
			await message.reply('Not playing in this server!');
		}
	} else if (message.content.startsWith(`${prefix}remove`)) {
		const index = message.content.split(' ')[1];
		if (subscription) {
			if (subscription.queue[parseInt(index) - 1]) {
				await message.reply(`removed ${index}-${subscription.queue[parseInt(index) - 1].title}`);
				subscription.queue.splice(parseInt(index) - 1, 1);
			} else {
				await message.reply(`no track on place ${index}`);
			}
		} else {
			await message.reply('Not playing in this server!');
		}
	} else if (message.content.startsWith(`${prefix}pause`)) {
		if (subscription) {
			subscription.audioPlayer.pause();
			await message.reply({ content: `Paused!` });
		} else {
			await message.reply('Not playing in this server!');
		}
	} else if (message.content.startsWith(`${prefix}resume`)) {
		if (subscription) {
			subscription.audioPlayer.unpause();
			await message.reply({ content: `Unpaused!` });
		} else {
			await message.reply('Not playing in this server!');
		}
	} else if (message.content.startsWith(`${prefix}stop`)) {
		if (subscription) {
			subscription.voiceConnection.destroy();
			subscriptions.delete(message.guild.id);
			await message.reply({ content: `Left channel!` });
		} else {
			await message.reply('Not playing in this server!');
		}
	} else if (message.content.startsWith(`${prefix}loop`)) {
		if (subscription) {
			subscription.loop = !subscription.loop;
			if (subscription.loop) {
				await message.reply('Dönüyorum');
			} else {
				await message.reply('Durdum');
			}
		} else {
			await message.reply('Yok ki nasıl döneyim');
		}
	} else if (message.content.startsWith(`yetiş ya hızır`)) {
		var names = '';
		for (var i = 0; i < commands.length; i += 1) {
			names += commands[i].name + ', ';
		}
		const embed = new Discord.MessageEmbed()
			.setColor('#34eb3a')
			.setTitle('Komutlar')
			.setDescription('Emir verirken fazla abartmayalım. Botuz diye ezilecek değiliz.')
			.addField('Eğlencelik', names)
			.addFields(help);
		message.channel.send({ embeds: [embed] });
	} else if (message.content.startsWith(`${prefix}`)) {
		await message.reply('Unknown command');
	}
});

/**
 * Maps guild IDs to music subscriptions, which exist if the bot has an active VoiceConnection to the guild.
 */

client.on('error', console.warn);

void client.login(token);
