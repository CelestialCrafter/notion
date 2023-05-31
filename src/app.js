import { Client as NotionClient } from '@notionhq/client';
import { Client as DiscordClient, GatewayIntentBits } from 'discord.js';
import { config } from 'dotenv';

config();

const notion = new NotionClient({ auth: process.env.NOTION_TOKEN });
const discord = new DiscordClient({ intents: [GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessages] });

const addSleepRecord = (melatonin, { start, from, to }) => {
	const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
	console.log(Math.round(((to - from) / 1000 / 60 / 60) * 10) / 10);

	try {
		return notion.pages.create({
			parent: { database_id: process.env.NOTION_DATABASE_ID },
			properties: {
				'Hours (Title)': {
					title: [{
						type: 'text',
						text: {
							// @TODO fix 1110842086833520660 saying 35.5h
							content: `${Math.round(((to - from) / 1000 / 60 / 60) * 10) / 10} Hours`
						}
					}]
				},
				Hours: {
					date: {
						start: from.toISOString(),
						end: to.toISOString(),
						time_zone: timeZone
					}
				},
				Melatonin: {
					select: {
						name: `${melatonin}mg`
					}
				},
				'Melatonin Hours': {
					date: {
						start: start.toISOString(),
						time_zone: timeZone
					}
				}
			}
		});
	} catch (err) {
		if (!err?.body.includes('start date must be before end date')) throw err;
		else {
			console.log('!!! INVALID RECORD !!!');
			console.log('start date must be before end date');
		}
	}
};

const formatDiscordRecord = async message => {
	const { content, createdTimestamp: sleepTimestamp, editedTimestamp: wakeTimestamp } = message;

	const sleepBaseDate = new Date(sleepTimestamp);
	sleepBaseDate.setHours(0);
	sleepBaseDate.setMinutes(0);
	sleepBaseDate.setSeconds(0);
	sleepBaseDate.setMilliseconds(0);

	const wakeBaseDate = new Date(wakeTimestamp);
	wakeBaseDate.setHours(0);
	wakeBaseDate.setMinutes(0);
	wakeBaseDate.setSeconds(0);
	wakeBaseDate.setMilliseconds(0);

	const dataLines = content.split('\n');

	const melatonin = Number(dataLines[0].replace(/mg.+/, ''));

	const convertTime = (timeString, base) => {
		const newTime = new Date(base);
		const timeArray = timeString.split(':');

		timeArray.push(timeArray[1].replace(/(a|p)m/, ''));
		timeArray.push(timeArray[1].replace(/[0-9][0-9]?/, ''));

		newTime.setHours(Number(timeArray[0]) + (timeArray[3] === 'am' ? 0 : 12));
		newTime.setMinutes(Number(timeArray[2]));

		return newTime;
	};

	const melatoninTime = convertTime(dataLines[0].replace(/.+mg /, ''), sleepBaseDate);
	const sleepStart = convertTime(dataLines[1].replace('asleep ', ''), sleepBaseDate);
	const sleepEnd = convertTime(dataLines[2].replace('wake up ', ''), wakeBaseDate);

	console.log(sleepStart);
	console.log(sleepEnd);

	return {
		melatonin,
		start: melatoninTime,
		from: sleepStart,
		to: sleepEnd
	};
};

const fetchRecords = async () => {
	const channel = await discord.channels.fetch(process.env.DISCORD_DATABASE_ID);
	const messages = await channel.messages.fetch();

	return messages;
};

const sleep = ms => new Promise(res => { setTimeout(res, ms); });

(async () => {
	console.log('Starting');

	await discord.login(process.env.DISCORD_TOKEN);
	console.log(`Logged in as ${discord.user.username}`);

	const messages = await fetchRecords();
	console.log('Messages Fetched');

	// eslint-disable-next-line no-restricted-syntax
	for (const [id, message] of messages) {
		console.log(`Initiating record ${id}`);

		const {
			melatonin,
			start,
			from,
			to
		} = await formatDiscordRecord(message);
		console.log('Formatted');

		await addSleepRecord(melatonin, {
			start,
			from,
			to
		});

		console.log('Added to Notion');

		await sleep(250);
	}
})();
