const Discord = require('discord.io');
var config = require('./config.js'); // 'var' to reload on the fly.
const util = require('../Utilities/utilities.js');

var bot = null;

const defConsoleDebug = console.debug;
if (!config.debug) console.debug = function(){};
const ut = function() {return (util.timestamp() + ' ')};

startBot();

var discordRetries = 0;
function startBot() {
	console.log(ut() + '[DISCORD] Starting bot.');
	var chkChannel = config.sandbox ? config.discord.sandboxID : config.discord.facchatID;

	try {
		bot = new Discord.Client({
			token: config.discord.botToken,
			autorun: true
		});
	} catch (err) {
		console.error(ut() + '[DISCORD] new Bot Error: ', err);
		process.exit();
	}

	bot.on('ready', function (evt) {
		try {
			discordRetries = 0;
			console.log(ut() + '[DISCORD] ' + config.discord.botname + ' Bot connected!');
			console.log(ut() + '[DISCORD] ' + config.discord.botname + ' logged in as: ');
			console.log(ut() + '[DISCORD] bot: ', bot); // + bot.username + ' ID: ' + bot.id);

			sendMessageToDiscordUser("Test Message to xedx", '926988316300152944');

			sendMessageToDiscordChannel("Test Message to Sandbox", config.discord.sandboxID);


		} catch (err) {
			console.error(ut() + '[DISCORD] on ready Error: ', err);
			process.exit();
		}
	});

	bot.on('message', function (user, userID, channelID, message, event) {

		// Only respond in configured channels.
		if (channelID != chkChannel) return;

		try {
			console.log(ut() + '[DISCORD] user, userID, channelID: ', user + ' ' + userID + ' ' + channelID);
			console.log(ut() + '[DISCORD] msgID: ' + event.d.id + ' timestamp: ' + event.d.timestamp);
			console.log(ut() + '[DISCORD] msg: ', message);
			console.log(ut() + '[DISCORD] Author: ', event.d.author.username);
			console.log(ut() + '[DISCORD] Bot: ', event.d.author.bot);

			if (event.d.author.bot) return;

		} catch (err) {
			console.error(ut() + '[DISCORD] on message Error: ', err);
			process.exit();
		}
	}); // end bot.on(message)

	bot.on('disconnect', function(errMsg, code) { 
		console.log(ut() + '[DISCORD] Error: ' + errMsg + ' Code: ' + code);
		process.exit();
		//setTimeout(reconnectBot, 500); //Auto reconnect (if configured to)
	});

}

// Auto-reconnect function for the bot
var discordRetries = 0;
function reconnectBot() { //Auto reconnect
	if (config.web.attemptRecovery && (discordRetries++ < config.web.maxRecoveries)) {
		bot.connect();
	}
}

// My ID: 926988316300152944
// sandbox: config.discord.sandboxID
async function sendMessageToDiscordUser(message, userID) {
	console.log(ut() + '[sendMessageToDiscordUser] "' + message + '"');

	let res = bot.sendMessage({
    	to: userID,
    	message: message
	});

    console.log(ut() + '[sendMessageToDiscordUser] sent. res = ', res);
}

function sendMessageToDiscordChannel(message, channel) {
	console.log(ut() + '[sendMessageToDiscordChannel] "' + message + '"');
	let res = bot.sendMessage({
	    to: channel,
	    message: message
	})

	console.log(ut() + ut() + '[sendMessageToDiscordChannel] response: ', res);
}




