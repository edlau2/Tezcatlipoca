#!/usr/bin/env node

module.exports = {
    postMessageToDiscord,
};

/********************************************************************************
 *  
 * File: fac-chat.js
 * 
 * Traps Torn fac chat via a WebSocket and forwards to Discord
 * 
 *******************************************************************************/

/**
 * Global variables
 */

//const WebSocket = require('websocket').w3cwebsocket; // See 'https://github.com/theturtle32/WebSocket-Node'
const WebSocket = require('ws');
const fs = require('fs');
const fetch = require('cross-fetch');
const http = require('http');
const moment = require('moment');
const path = require('path');

/*
const requesters  = {
        http:     require('http'),
        https:    require('https')
	};
*/

var config = require('./config.js'); // 'var' to reload on the fly.
const listener = require('./request-listener.js');
const status = require('../Utilities/http-status.js');
const util = require('../Utilities/utilities.js');

const nodeUtil = require('util');

const Discord = require('discord.io');
const auth = require('./auth.json');

const webhookURL = config.sandbox ? config.discord.sandbox_webhook : config.discord.webhook;

console.debug('\nconfig.sandbox: ' + config.sandbox);
console.debug('Destination webhook:\n' + webhookURL);
if (webhookURL == config.discord.webhook) console.debug('*** Fac Chat channel ***');
if (webhookURL == config.discord.sandbox_webhook) console.debug('*** Sandbox channel ***');

if (config.sandbox) config.api.archive = false; // For now, don't let sandbox tests archive. Can set in config.

const facRoomID = config.web.roomId;
const globalRoomID = 'Global';
const tradeRoomID = 'Trade';

const scriptName = path.basename(module.filename, path.extname(module.filename));
if (config.logToFile) {util.enableLogfileOutput(scriptName, config.logfilemode)};

const defConsoleDebug = console.debug;
if (!config.debug) console.debug = function(){};
const ut = function() {return (util.timestamp() + ' ')};

var messageQueue = []; // Global message queue
var internalHandleQueue = []; // Handles that need to be closed before termination
const appMsgPrefix = '...' + config.discord.appUserName + ' says: "'; // Identifier for msg from this app
var msgArray = []; // Saved message ID's
const msgArrayMax = config.api.savedMsgsmax; // Max array length
var globalWS = null; // Global WebSocket
var httpServer = null; // Global web server for debug/devel
var oldMessagePurgeTimer = null; // Timer to purge old messages

var stats = {'dups': 0,
			 'pings': 0,
			 'pongs': 0,
			 'latePong': 0,
			 'MaxSendQLen': 0,
			 'MaxRecvQLen': 0,
			 'StartTime': new Date(),
			 'Uptime': 0
			 }

/********************************************************************************
 *  
 * Main entry point
 * 
 *******************************************************************************/

console.log('\n' + ut() + 'Starting' + scriptName + ':\n\tPID = ' + process.pid + '\n\tPlatform: ' + process.platform + '\n');

// Check for an orphaned process
let lastPid = null;
try {
    lastPid = Number(fs.readFileSync('facchat-pid.dat'));
	if (util.pidIsRunning(lastPid)) {
		console.error('\n\n**** Error: PID ' + lastPid + ' is active! *****\n\n')
		process.kill(lastPid, 'SIGKILL');
	}
} catch (e) {
	console.debug(ut() + 'Can`t check last PID: ', e);
}

// Traps various signals to abort, quit, run under a debugger, etc.
util.installSignalHandlers(myProcessExit);

try {
	msgArray = JSON.parse(fs.readFileSync(config.api.datafile));
	console.log(ut() + 'Imported sent message queue: ' + msgArray.length + ' messages.');
} catch (err) {
	console.log(ut() + 'Erorr reading data file: ', err);
}

// Open the WebSocket for chat
globalWS = newSocket();
installSocketHandlers(globalWS);

// Start a web service to test commands without interacting with chat (if so configured)
if (config.web.listen) startWebService();

// Start listening for Discord messages (if so configured)
var bot = null;
if (config.discord.listen) startBot();

// Handle termination events.
var terminationStarted = false;
async function myProcessExit() {
	console.log('\n\nmyProcessExit: terminationStarted? ', terminationStarted);
	if (terminationStarted) return; // Do only once.
	terminationStarted = true;
	console.log(ut() + 'Notifying Discord of disconnect...');
	sendDiscordDisconnect();

	console.log(ut() + 'Closing WebSocket...');
	config.web.attemptRecovery = false; // Don't re-open if we closed ourselves!!
	if (globalWS) globalWS.close();

	if (bot) {
		console.log(ut() + 'Disconnecting Discord bot...');
		bot.disconnect();
		bot = null;
	}

	console.log(ut() + 'Closing interval handles...');
	let handle = internalHandleQueue.pop();
	while (handle) {
		clearTimeout(handle);
		handle = internalHandleQueue.pop();
	}
	emptyBankerSetQueue();
	if (oldMessagePurgeTimer) clearTimeout(oldMessagePurgeTimer);

	// Save our array of last messages, so we don't send dups.
	console.log(ut() + 'Saving array data...');
	fs.writeFile(config.api.datafile, JSON.stringify(msgArray), function(err) {
		if (err) {
			console.log(ut() + 'Error write data file: ', err);
		} else {
			console.log(ut() + 'File "' + config.api.datafile + '"" written succesfully.');
		}
	});

	// Save our process ID, in case we don't really go away.
	console.log(ut() + 'Saving PID for next process...');
	fs.writeFile('facchat-pid.dat', process.pid.toString(), function(err) {
		if (err) {console.log(ut() + 'Error write PID file: ', err);}
	});

	// Close the HTTP server
	if (config.debug && httpServer) {
		console.log(ut() + "Closing web services...");
		let x = setTimeout(finalTerm, 2000); // Safety net, if HTTP server can't close.
	    httpServer.close(() => {
	    	clearTimeout(x);
		    console.log(ut() + "Web service stopped.");
		    finalTerm();
		});
		httpServer = null;
	} else {
		finalTerm();
	}
}

function finalTerm() {
	console.log(ut() + 'Terminating process...');
	setTimeout(function() {
		console.log(ut() + 'Calling process.exit().');
		//if (logFile) logFile.close();
		process.exit();
	}, 1000);
}

//////////////////////////////////////////////////////////////////////
// Install handlers for a socket. Done here (in a separate function)
// so we can easily retry a failed/closed socket.
//////////////////////////////////////////////////////////////////////

function installSocketHandlers(socket) {
	console.log(ut() + 'installSocketHandlers()');
	if (!globalWS) {
            console.log(ut() + 'Error creating WebSocket!');
            return;
        }

    // Handle received chat messages
    globalWS.onmessage = function(event) {
    	if (terminationStarted) return;
        if (typeof event.data === 'string') {
            let jsonObject = JSON.parse(event.data);
            let message = jsonObject.data[0];
            if (message.roomId === facRoomID && message.hasOwnProperty("messageText")) {
                postMessageToDiscord(message);
                return;
            }
        }
    };

    // Handle 'ping/pong'
    globalWS.on('pong', function() {
    	if (!config.api.silentPing) console.debug(ut() + '[PONG]');
    	if (pingTimeout) clearInterval(pingTimeout);
    	stats.pongs++;
    });

    globalWS.on('ping', function() {
    	if (!config.api.silentPing) console.debug(ut() + '[PING]');
    	sendPong();
    });

    // Handle socket open event.
    globalWS.onopen = function() {
    	console.log(ut() + 'WebSocket client connected.');
    	socketRetries = 0;
    	sendPing();
    	installInternalHandlers();
	};

    // Handle socket close events.
    globalWS.onclose = function(event) {
    	console.log(ut() + 'WebSocket.onclose');
    	if (terminationStarted) return;
        if (event.wasClean) {
            console.log(ut() + `[close] Connection closed cleanly.\n\tcode=${event.code}\n\treason=${event.reason}`);
        } else {
            console.log(ut() + `[close] Connection died!\n\tcode=${event.code}\n\treason=${event.reason}`);
        }
        recoverSocket();
    };

    // Handle socket errors
    globalWS.onerror = function(error) {
    	console.log(ut() + 'WebSocket.onerror');
    	if (terminationStarted) return;
        let httpCode = error.message.match(/\d+/);
        let httpStatus = status.HttpStatusEnum.get(Number(httpCode));
        let httpMsg = httpStatus ? (httpCode + ' ' + httpStatus.name + ' : ' + httpStatus.desc) : 'Unknown';
        console.log(ut() + `[error] Connection error detected!` + 
        	`\n\tHTTP error: ${httpMsg}\n\tmessage=${error.message}\n\terror=${error.error}\n\tclose=${error.close}`);
        recoverSocket();
    };

    console.log(ut() + 'WebSocket initialized, waiting for client connection.');
}

//////////////////////////////////////////////////////////////////////
//
// Install internal handlers, once the client is connected.
//
//////////////////////////////////////////////////////////////////////

function installInternalHandlers() {
	// clear any existing handles
	console.log(ut() + 'Clearing internal handles...'); 
	let handle = internalHandleQueue.pop();
	while (handle) {
		clearTimeout(handle);
		handle = internalHandleQueue.pop();
	}

	// Internal message queue handler
    let imqh = setInterval(function() {
    	message = messageQueue.shift();
    	if (message && message.state != undefined) {
    		console.debug(ut() + '[Dequeued] [' + message.sequenceNumber + 
    			'] [' + message.messageId + '] [' + message.state + ']');
    		message.state = 'dequeued';
    		postMessageToDiscord(message);
    	}
    }, config.api.msgQueueDelay);
    internalHandleQueue.push(imqh);
    console.log(ut() + 'Message Queue initialized.');

    // Internal status indicator. This sends a 'PING' and records
    // the received 'PONG'.
    internalHandleQueue.push(setInterval(sendPing, config.api.pingPongInterval));

    sendDiscordConnect();
}

//////////////////////////////////////////////////////////////////////
//
// Attempt to recover from a socket error or disconnect
//
//////////////////////////////////////////////////////////////////////

var socketRetries = 0;
function recoverSocket() {
	if (!config.web.attemptRecovery) {
		console.log(ut() + 'Socket disconnect or error, and not configured for retries.');
		console.log(ut() + "*** Shutting down process ***");
		if (!terminationStarted) myProcessExit();
		return;
	}

	if (socketRetries++ > config.web.maxRecoveries && config.web.maxRecoveries != -1) {
		console.log(ut() + '*** Too many recovery attempts, aborting. ***');
		if (!terminationStarted) myProcessExit();
		return;
	}
	if (!terminationStarted) {
		console.log(ut() + 'Attempting to reconnect WebSocket...');
		globalWS = newSocket();
		installSocketHandlers(globalWS);
	}
}

//////////////////////////////////////////////////////////////////////
//
// Start a web service to listen for debugging commands.
//
// To interact:
//
//    curl "http://localhost:8001/facchat/?cmd=message&msg=<message text>"
//
//////////////////////////////////////////////////////////////////////

function startWebService() {
	console.log(`\n\nOpening HTTP server on on http://${config.web.host}:${config.web.port}...`);

	httpServer = http.createServer(listener.requestListener);
	httpServer.listen(config.web.port, config.web.host, () => {
	    console.log(ut() + `FacChat Web Server is running on http://` + 
	    	server.address().address + `:` + server.address().port + `/facchat`);
	  });

	// Error event
	httpServer.on('error', (e) => {
	  if (terminationStarted) return;
	  if (e.code === 'EADDRINUSE') {
	    console.log('HTTP server address in use, retrying...');
	    if (socketRetries++ < config.web.maxRecoveries) {
		    setTimeout(() => {
		      if (!httpServer || terminationStarted) return;
		      httpServer.close();
		      httpServer.listen(config.web.port, config.web.host);
		    }, 1000);
		}
	  } else {
	    console.log("HTTP server error:", e);
	    console.log("Aborting process.");
	    process.emit("SIGTERM");
	  }
	});

	// Close event
	httpServer.on('close', () => {
	  console.log(ut() + "Web service closed successfully.");
	});
}

//////////////////////////////////////////////////////////////////////
//
// Create a new WebSocket for chats.
//
// Secret and UID come from here:
//
// <script type="text/javascript" src="/builds/chat/59d9fe8550eafcf95e9afe31b4e9d42e/chats.js" uid="2100735"
// name="xedx" secret="64ae61cdf04d3ba3d3b3b2ddc5e853d099f89a53b3ea2f8228674a730ea40263" donator="true"></script>
//
// Right above...
// <div id="chatRoot" class="no-zalgo">...<div>
//
//////////////////////////////////////////////////////////////////////

function newSocket() {
    const wsURL = config.web.chatURL + '?uid=' + config.web.uid + "&secret=" + config.web.secret;
    console.debug(ut() + 'wsURL: ' + wsURL);
    return new WebSocket(wsURL, [], {'origin': config.web.origin});
}

//////////////////////////////////////////////////////////////////////
// Post a simple message to discord - this is the 'mirroring'
//
// Note: it seems the same message somehow comes through here,
// with the same mesageID, diff. sequence #. Not sure why.
//////////////////////////////////////////////////////////////////////

function postMessageToDiscord(message) {
	if (!message) return;

 	// Push on queue, we'll get it later. Check first for duplicates.
	if (message.state != 'dequeued') {
		if (isMsgSent(message)) {
			if (!config.api.silentSuppressDups) {
				console.log(ut() + '[Duplicate] [' + message.sequenceNumber + '] [' + message.messageId + '] Suppressed.');
			}
			stats.dups++;
			return;
		}
    	saveMessageId(message);
		message.state = 'queued';
		messageQueue.push(message);
		if (messageQueue.length > stats.MaxRecvQLen) stats.MaxRecvQLen = messageQueue.length;
		return;
	}

	if (message.messageText.indexOf(appMsgPrefix) > -1) message.type = 'chatOnly';

	console.log(ut() + '[Message] [' + message.sequenceNumber + '] [' + message.messageId + '] [' + 
                  message.senderName + '] [' + message.state + '] [' + message.type + '] : ' + message.messageText);

	// Reformat the original message for Discord
	let textMsg = '';

    if (message.senderId) {
    	textMsg = '**' + message.senderName + '** [' + message.senderId + ']: ' + message.messageText;
    } else {
    	textMsg = '**' + message.senderName + '**: ' + message.messageText;
    }

    // Handle app-specific messages, not forwarded to Discord (usually)
    if (config.filter.allowInternalInteraction || message.type == 'dev') {
	    if (handleInternalMessage(message)) {
	    	console.log(ut() + '[handled internal] HANDLED [' + message.sequenceNumber + '] [' + message.messageId + '] [' + 
	                  message.senderName + '] [' + message.type + '] [' + message.state + ']: ' + message.messageText);
	    	return;
	    }
	}

    // If sent directly here (not from the onMessage handler), don't mirror.
    if (message.type == 'chatOnly' || message.type == 'dev') return;

    message.messageText = textMsg;
    doDiscordFetch(message);

    // If desired, duplicate to another channel that's not purged
    if (config.api.archive && config.discord.archive_webhook && !message.altURL) {
    	message.altURL = config.discord.archive_webhook;
    	doDiscordFetch(message);
    }
}

//////////////////////////////////////////////////////////////////////
// Actually mirror the message to Discord
//////////////////////////////////////////////////////////////////////

function doDiscordFetch(message) {
	let useURL = message.altURL ? message.altURL : webhookURL;
    console.debug(ut() + '[doDiscordFetch] [' + message.sequenceNumber + '] [' 
    	+ message.messageId + '] [' + message.state + '] :' + message.messageText);

    if (message.altURL == config.discord.archive_webhook) {
    	console.log(ut() + '**** [doDiscordFetch] Archived copy ****');
    }

    if (message.altURL == config.discord.banker_webhook) {
    	console.log(ut() + '**** [doDiscordFetch] Banker copy ****');
    }

    if (message.altURL == config.discord.webhook) console.debug(ut() + '[doDiscordFetch] *** Fac Chat channel ***');
	if (message.altURL == config.discord.sandbox_webhook) console.debug(ut() + '[doDiscordFetch] *** Sandbox channel ***');
	console.debug(ut() + '[doDiscordFetch] useURL:\n' + useURL);

	fetch(useURL, {
		  method: "POST",
		  headers: {'Content-type': 'application/json'},
		  body: JSON.stringify({content: message.messageText})
	}).then(res => {
		console.log(ut() + '[doDiscordFetch] [Mirrored] [' + message.sequenceNumber + '] [' + message.messageId + ']');
		if (!config.api.silentResponse) {
			console.log(ut() + '[doDiscordFetch] [Response] [' + message.sequenceNumber + '] [' + message.messageId + '] ' + res.status + ' ' + res.statusText);
		}

		if (config.api.trackRate || Number(res.status) == 429) {
			let hdrs = res.headers;
			let hdrText = '[doDiscordFetch] [Rate Headers] Limit: ' + hdrs.get('x-ratelimit-limit') + ' Remaining: ' + hdrs.get('x-ratelimit-remaining') +
				' Reset: ' + hdrs.get('x-ratelimit-reset') + ' After: ' + hdrs.get('x-ratelimit-reset-after') +
				' Scope: ' + hdrs.get('X-ratelimit-scope');
			console.debug(ut() + '[Rate] ' + hdrText);
		}
	}).catch(err => {
	    console.error(ut() + '[doDiscordFetch] Error: ', err);
	});

    message.state = 'sent';
}

//////////////////////////////////////////////////////////////////////
// Post a message as an embedd to Discord
//////////////////////////////////////////////////////////////////////

function postEmbedToDiscord(title, text) {
	var params = {
	    username: config.discord.appUserName,
	    avatar_url: config.discord.appUserAvatar,
	    content: "",
	    embeds: [
	        {
	        "title": title,
	        "description": text,
	        "color": 3447003,
	        "thumbnail": {
	            "url": config.discord.appUserThumbnail,
	        }
	     }]
	 };

	fetch(webhookURL, {
		  method: "POST",
		  headers: {'Content-type': 'application/json'},
		  body: JSON.stringify(params)
		}).then(res => {
		    console.log('[Embed Sent] ' + JSON.stringify(res));
		}).catch(err => {
		    console.error('[Embed Error] ' + JSON.stringify(err));
		});
}

//////////////////////////////////////////////////////////////////////
// Post an image embed to Discord
//////////////////////////////////////////////////////////////////////

function postImageEmbedToDicord(myTitle, desc, imgURL) {
	console.log('postImageEmbedToDicord');
	var params = {
	    username: config.discord.appUserName,
	    avatar_url: config.discord.appUserAvatar,
	    content: "",
	    embeds: [
	        {
			color: 0x0099ff,
			title: myTitle,
			description: desc,
			"thumbnail": {
	            "url": config.discord.appUserThumbnail,
	        },
			image: {
				url: imgURL
			}
		}]
	};

	fetch(webhookURL, {
		  method: "POST",
		  headers: {'Content-type': 'application/json'},
		  body: JSON.stringify(params)
		}).then(res => {
		    console.log('[Embed Sent] ' + JSON.stringify(res));
		}).catch(err => {
		    console.error('[Embed Error] ' + JSON.stringify(err));
		});
}

// Send any message to Discord. But NOT through internal filtering!
function sendDiscord(messageText, altURL=null) {
	let msg = config.api.appMsg;
	msg.messageText = messageText;
	msg.type = 'discordOnly';
	if (altURL) 
		msg.altURL = altURL;
	else
		msg.altURL = null;
	console.debug(ut() + '[sendDiscord] posting');
	postMessageToDiscord(msg);
}

// Send a message to the 'banker' channel
// Note that we don't want to flood Discord with dup
// requests from any given member, so queue them in 
// a timed queue - they'll pop themselves off in
// 'x' minutes to be able to ask again.
function hasAmount(x) {
	let parts = x.split(' ');
	for (let i=0; i<parts.length; i++) {
		if(parts[i].toLowerCase().indexOf('balance') > -1) {return true;}
		if(parts[i].toLowerCase().indexOf('everything') > -1) {return true;}
		let res = parts[i].match(/(\d+)/); //[0];
		if (!res) {continue;}
		return true;
	}
	return false;
}

function letBankerKnow(message) {
	// Verify that the amount of money was actually asked for, otherwise, 
	// let them know an amount needs to be specified.
	if (!hasAmount(message.messageText)) {
		return sendChatOnly(message.senderName + 
			", you need to specify how much money you'd like to withdraw!");
	}
	if (isOnBankerSendQueue(message.senderId)) {
		let timeLeft = timeLeftOnQueue(message.senderId);
		return sendChatOnly(message.senderName + 
			', you need to wait about ' + timeLeft + ' before further @banker requests will be mirrored to Discord.');
	}
	addIdTobankerSentQueue(message.senderId);

	let text = config.discord.bankerID + '```It sounds like ' + message.senderName + ' [' + message.senderId + 
				'] is looking for a banker!\n\nThis is what was written in Chat:\n\n' + message.messageText + '```';
	let msg = {'senderName': message.senderName, 'senderId': message.senderId, 
		'sequenceNumber': 0, 'messageId': 0, 'state:': 'dequeued', 'messageText': text, 'type': 'discordOnly',
		'altURL': config.discord.banker_webhook};
	postMessageToDiscord(msg);
	sendChatOnly(message.senderName + ' - I forwarded you message to Discord for you! ' +
		'Subsequent @banker requests won`t be forwarded for ' + config.api.bankerQueueMin + ' minutes.');
}

// Send a message indicating we're disconnecting for a bit.
var disconnectMsgSent = false;
function sendDiscordDisconnect() {
	if (disconnectMsgSent) return;
	if (config.api.silentRestarts) return;
	let msg = JSON.parse(JSON.stringify(config.api.appMsg));
    msg.messageText =  '```NOTE: Fac Chat mirroring is going away for bit for maintainance. Be right back!```';
    postMessageToDiscord(msg);
    disconnectMsgSent = true;
    connectMsgSent = false;
}

// Send a message that we're back online
var connectMsgSent = false;
function sendDiscordConnect() {
	console.log(ut() + '[sendDiscordConnect]')
	if (connectMsgSent) return;
    connectMsgSent = true;
    disconnectMsgSent = false;
	if (config.api.silentRestarts) return;
	let msg = JSON.parse(JSON.stringify(config.api.appMsg));
    msg.messageText =  '```Fac Chat mirroring is up and active!```';
    postMessageToDiscord(msg);
}

// Send a 'ping'
var pingTimeout = null;
function sendPing() {
	if (globalWS.readyState != 1) return;
	if (!config.api.silentPing) console.log(ut() + '[PING]');
	pingTimeout = setTimeout(pingCB, 10000); // Allow 10 secs to record missed PONG
	globalWS.ping();
	stats.pings++;
}

// Called on ping timeout
function pingCB() {
	let msg = ut() + '[PING] no response! (missed PONG), ' + stats.latePong + ' missed!';
	if (!config.api.silentPing) console.log(msg);
	sendMessageToDiscordChannel(msg, config.discord.sandboxID);
	stats.latePong++;
}

// Respond with a 'pong' (not yet tested)
function sendPong() {
	if (!config.api.silentPing) console.log(ut() + '[PONG]');
	globalWS.pong();
}

//////////////////////////////////////////////////////////////////////
//
// Send various chat messages, internally.
//
//////////////////////////////////////////////////////////////////////

// Not sure how this'll work...
// It does! but my user name/ID....
const chat =  {"proc":"rooms/sendMessage",
			   "data":{
			        "roomId":["Faction:8151"],
			        "messageText":[""]
			        },
			   "v":4};

// Note: the 'type' is moot, as it will be removed when sent
// to the chat server. So, we depend on the appMsgPrefix to
// prevent sending to Discord.
function sendChat(messageText, type=null) {
	if (globalWS.readyState != 1) return;
	console.log('[internal send] ' + messageText);
	let msg = chat;
	if (type) {
		msg.type = type;
	}
	msg.data.messageText[0] = messageText;
	//msg.data.senderName = config.discord.appUserName; // Does NOT work. At all.
	console.log('[internal msg]', msg);
	globalWS.send(JSON.stringify(msg));
}

// Send a chat, but to chat only - do NOT send to Discord.
function sendChatOnly(text) {
	sendChat(appMsgPrefix + text + '"', 'chatOnly');
}

function sendSeeDiscordChat() {
	sendChatOnly('Please see Discord fac-chat for details.');
}

//////////////////////////////////////////////////////////////////////
//
// Handle messages sent from fac chat to the app for internal
// processing. 
//
// Return TRUE if handled (do not pass to Discord), FALSE otherwise.
//
// When adding commands, don't forget to add to help.
//
//////////////////////////////////////////////////////////////////////

function handleInternalMessage(message) {
	console.log(ut() + '[handleInternalMessage] [' + message.sequenceNumber + '] [' + message.messageId + '] [' + 
                  message.senderName + '] [' + message.state + '] [' + message.type + ']: ' + message.messageText);

	let msg = message.messageText;
	let orgMsg = msg; // Unused?
	if (message.type == 'discordOnly') return false;
	let isAthena = (msg.indexOf(config.discord.appUserName) == 0); // Starts with 'Athena'
	if (isAthena) msg = msg.substring(config.discord.appUserName.length + 1); // Everything after 'Athena'

	let parsed = msg.toLowerCase().trim();
	let parts = parsed.split(' ');
	parsed = parts[0];

	// Handle both '!' and '@' prefix. To handle '!' from curl, un-escape
	// if prefixed with a '\'.
	if (parsed.charAt(0) == '\\') parsed = parsed.substring(1);
	if (parsed.charAt(0) == '!') parsed = '@' + parsed.substring(1);
	
	console.log(ut() + '[handleInternalMessage] msg = "' + orgMsg + '"');
	console.log(ut() + '[handleInternalMessage] command = "' + parsed + '"');

    switch (parsed) { // Note lower case: use lower case in switch

    	// ============= General purpose (available to everyone) commands =============
    	case '@help':
    	case 'help':
    	case '!help':
    		console.log(formatInternalCmdHelp());
    		setTimeout(function() {
    			postEmbedToDiscord('Help', formatInternalCmdHelp());
    		}, 500);
    		if (message.type != 'dev') {
    			sendSeeDiscordChat();
    		}
    		return false;
		case '@banker':
			if (!config.api.allowBanker) {
				console.log(ut() + '[handleInternalMessage] Banker notifications disabled!');
				break;
			}
			letBankerKnow(message);
			break;

		case '@gymgains':
		case '@travel':
		case '@crimes':
		case '@nerve':
		case '@toleration':
		case '@steadfast':
		case '@aggression':
		case '@suppression':
		case '@voracity':
		case '@fortitude':
		case '@excursion':
		case '@criminality':
			getFacUpgrades(parsed.substring(1), message);
			return false;

		// ============= Developer/committee only commands =============
		case '@queue':
			console.log(ut() + '[handleInternalMessage] messageQueue.length: ', messageQueue.length);
			console.log(ut() + '[handleInternalMessage] messageQueue: ', messageQueue);
			return false;
		case '@ping':
			if (!validateSender(message)) return false;
			sendPing();
			return true;
		case '@stats':
			if (!validateSender(message)) return false;
			stats.Uptime = new Date(new Date() - stats.StartTime).toISOString().substr(11, 8);
			console.log(ut() + '[handleInternalMessage] Stats: ', stats);
			setTimeout(function(){postEmbedToDiscord('Application Statistics', JSON.stringify(stats, null, 4));}, 1000);
			return false;
		case '@config':
			if (!validateSender(message)) return false;
			console.log(ut() + '[handleInternalMessage] Config: ', config);
			setTimeout(function(){postEmbedToDiscord('Application Configuration', JSON.stringify(config, null, 4));}, 1000);
			return false;
		case '@reload':
			if (!validateSender(message)) return false;
			console.log(ut() + '[handleInternalMessage] [RELOAD]');
			delete require.cache[require.resolve('./config.js')];
			config = require('./config.js');
			if (!config.debug) {
				console.debug = function(){};
			} else {
				console.debug = defConsoleDebug; // Will this work?
			}
			console.log(ut() + '[handleInternalMessage] Configuration reloaded, current config: ', config);
			setTimeout(function(){postEmbedToDiscord('App Config Reloaded', JSON.stringify(config, null, 4));}, 1000);
			return true;
		case '@sigusr1':
			if (!validateSender(message)) return false;
			console.log(ut() + '[handleInternalMessage] Sending "SIGUSR1"...');
			process.emit("SIGUSR1");
			return true;
		case '@restart':
			if (!validateSender(message)) return false;
			console.log(ut() + '[handleInternalMessage] Restarting process shortly.');
			setTimeout(function () {
				if (!terminationStarted) {
	    			process.on("exit", function () {
				        require("child_process").spawn(process.argv.shift(), process.argv, {
				            cwd: process.cwd(),
				            detached : true,
				            stdio: "inherit"
				        });
				    });
				    myProcessExit();
				}
			}, 5000);
			break;
		case '@terminate':
			if (!validateSender(message)) return false;
			console.log(ut() + '[handleInternalMessage] Process termination requested, shutting down gracefully.');
			myProcessExit();
			break;
		case '@abort':
			if (!validateSender(message)) return false;
			console.log(ut() + '[handleInternalMessage] Sending SIGKILL - abortive termination. This is NOT recommended!');
			//process.kill(process.pid);
			process.exit();
			break;
		default:
			console.log(ut() + '[handleInternalMessage] "' + parsed + '" not found.');
			break;
    }

    return false;
}

////////////////////////////////////////////////////////////////////////////////
// Validate that when requesting a command, it is from an authorized person: me.
// Only applies to certain dev commands.
////////////////////////////////////////////////////////////////////////////////

function validateSender(message) {
	let valid = false;
	if (message.senderId == config.web.uid) valid = true; // TBD: have an array to check in config.js
	if (message.senderName == 'developer') valid = true;
	if (message.roles) {
		let roles = message.roles;
		let isCommittee = roles.includes(config.discord.roles.committee);
		if (!isCommittee) valid = true;
	}

	if (valid) {
		console.log('[validateSender] APPROVED for [' + message.senderId + '] [ ' + message.senderName + ']');
		//sendDiscord("```One moment please, " + message.senderName + ". I'm sending to your console now.```");
		return true;
	}

	console.log('[validateSender] DENIED for [' + message.senderId + '] [' + message.senderName + ']');
	return false;
}

//////////////////////////////////////////////////////////////////////
// Display help for accepted commands.
//////////////////////////////////////////////////////////////////////

function formatInternalCmdHelp() {
	let text = 
	           //"All output is written to the console in the process where this is running.\n" +
	           //"\n\n__**Help Menu:**__\n\n" +
	           "Commands are not case-sensitive.\n" +
	           //"Commands must be preceeded by my name, " + config.discord.appUserName + ". Otherwise I won't listen to you.\n\n" +
	           "Commands must be the first thing typed in chat.\n" +
	           "Commands may be prefixed with either an '@' or an '!'.\n" +
	           "For example, '@banker can I please have $100m?' will be mirrored to the banker channel as well\n" +
	           "as being visible in chat. Typing '@steadfast' would show current steadfast perks in chat (and Discord).\n\n" +

	           "__**General Commands, available to everyone:**__\n\n" +
	           "**@help -or- !help:** Display this message.\n" +
			   "**@banker -or- !banker:** Mirrors request to the banker channels, and pings bankers.\n" +
			   "**@gymgains -or- !gymgains:** Alias for 'steadfast'.\n" +
			   "**@travel -or- !travel:** Alias for 'excursion'.\n" +
			   "**@crimes -or- !crimes:** Alias for 'criminality'.\n" +
			   "**@nerve -or- !nerve:** Alias for 'criminality'.\n" +
			   "**@steadfast -or- !steadfast:** Display current steadfast (gym gains) branch upgrades.\n" +
			   "**@toleration -or- !toleration:** Display current toleration (addiction) branch upgrades.\n" +
			   "**@aggression -or- !aggression:** Display current aggression (war perks) branch upgrades.\n" +
			   "**@suppression -or- !suppression:** Display current suppression branch (defense) upgrades.\n" +
			   "**@voracity -or- !voracity:** Display current voracity branch (consumables) upgrades.\n" +
			   "**@fortitude -or- !fortitude:** Display current fortitude (med stuff) branch upgrades.\n" +
			   "**@excursion -or- !excursion:** Display current excursion (travel) branch upgrades.\n" +
			   "**@criminality -or- !criminality:** Display current criminality (crimes/busts/nerve) branch upgrades.\n\n" +

			   "__**Developer Commands, available to developers/committee:**__\n\n" +
			   "**@stats -or- !stats:** Outputs application statistics in Discord.\n"	+
			   "**@reload -or- !reload:** Reads a possibly modified config.js file and uses new values.\n" +
			   "**@config -or- !config:** Output current app configuration in Discord.\n" +
			   "**@ping -or- !ping:** Sends a 'ping' message to the chat server.\n" +
			   "**@sigusr1 -or- !sigusr1:** Sends a SIGUSR1 signal (activate the Inspector API debugger).\n" +
			   "**@restart -or- !restart:** Restarts the process in about 5 seconds.\n" +
			   "**@terminate -or- !terminate:** Exits (completely stops) the process. Requires manual intervention to restart.\n" +
			   "**@abort -or- !abort**: Sends a SIGKILL, abortive termination. NOT recommended except in emergencies!\n\n";
	return text;
}

//////////////////////////////////////////////////////////////////////
//
// The bot - optional, via a config option.
//
// Listens for commands and routes them through the command proessor,
// handleInternalMessage()
//
//////////////////////////////////////////////////////////////////////

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
		myProcessExit();
	}

	bot.on('ready', function (evt) {
		try {
			discordRetries = 0;
			console.log(ut() + '[DISCORD] ' + config.discord.botname + ' Bot connected!');
			console.log(ut() + '[DISCORD] ' + config.discord.botname + ' logged in as: ');
			console.log(ut() + '[DISCORD] ' + bot.username + ' ID: ' + bot.id);
			setTimeout(function() {clearOldMessages(chkChannel)}, 5000);
		} catch (err) {
			console.error(ut() + '[DISCORD] on ready Error: ', err);
			myProcessExit();
		}
	});

	/*
	bot.channels[channelID].guild_id or event.d.guild_id → server ID
	bot.servers[serverID].members[userID] → member object
	bot.servers[serverID].members[userID].roles → array of role IDs
	bot.servers[serverID].members[userID].roles.includes(target) → boolean
	*/

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
			let roles = event.d.member.roles;
			console.log(ut() + '[DISCORD] Is committee: ', roles.includes(config.discord.roles.Committee));

			// Listen for messages that  start with `!` or '@'
			if (message.substring(0, 1) == '!' || message.substring(0, 1) == '@') {
			    let msg = config.api.devMsg;
	            msg.messageText = message;
	            msg.roles = roles;
	            postMessageToDiscord(msg);
			} // if '!' or '@'
		} catch (err) {
			console.error(ut() + '[DISCORD] on message Error: ', err);
			myProcessExit();
		}
	}); // end bot.on(message)

	bot.on('disconnect', function(errMsg, code) { 
		console.log(ut() + '[DISCORD] Error: ' + errMsg + ' Code: ' + code);
		setTimeout(reconnectBot, 500); //Auto reconnect (if configured to)
	});

	bot.on("presence", function(user, userID, status, game, event) {
		/*
		console.debug(ut() + 'DISCORD: presence:');
        console.debug(user + " is now: " + status);
        */
	});

	bot.on("any", function(rawEvent) {
		/*
		console.debug(ut() + 'DISCORD: any message:');
	    console.debug(rawEvent); //Logs every event
	    */
	});

}

// Auto-reconnect function for the bot
var discordRetries = 0;
function reconnectBot() { //Auto reconnect
	if (terminationStarted) return;
	if (config.web.attemptRecovery && (discordRetries++ < config.web.maxRecoveries)) {
		bot.connect();
	}
}

// My ID: 926988316300152944 This doesn't seem to work.
async function sendMessageToDiscordUser(message, userID) {
	console.log(ut() + '[sendMessageToDiscordUser] "' + message + '"');
	let res = bot.sendMessage({
	    to: channel,
	    message: message
	})

	console.log(ut() + ut() + '[sendMessageToDiscordUser] response: ', res);
}

function sendMessageToDiscordChannel(message, channel) {
	console.log(ut() + '[sendMessageToDiscordChannel] "' + message + '"');
	let res = bot.sendMessage({
	    to: channel,
	    message: message
	})

	console.log(ut() + ut() + '[sendMessageToDiscordChannel] response: ', res);
}

//////////////////////////////////////////////////////////////////////
//
// Function to filter messages older than 2 days old. 2 days and 
// older are then deleted
//
//////////////////////////////////////////////////////////////////////

/* Message format:
1:11:55 PM Response:  {
  id: '923122850691440641',
  type: 0,
  content: '_syntaxera_',
  channel_id: '888867831725318176',
  author: {
    id: '454782437210193940',
    username: 'xedx',
    avatar: '6573d25e177ec535c9800ec8b2cc3c69',
    discriminator: '0522',
    public_flags: 0
  },
  attachments: [],
  embeds: [],
  mentions: [],
  mention_roles: [],
  pinned: false,
  mention_everyone: false,
  tts: false,
  timestamp: '2021-12-22T08:00:38.398000+00:00',
  edited_timestamp: null,
  flags: 0,
  components: []
}
*/

var bulkDeleteQueue = [];
var singleDeleteQueue = [];
const limit = 100;
var lastID = 0;
var clearOldMessagesComplete = false;
var msgsSeen = 0;

function clearOldMessages(channel, startID = null) {
	if (!config.discord.purgeCheckIntHrs) return; // Never purge
	if (!oldMessagePurgeTimer) {
		oldMessagePurgeTimer = setInterval(function(){clearOldMessages(channel)}, 
			config.discord.purgeCheckIntHrs * 60 * 60 * 1000);
	}

	try {
		if (!startID) startID = bot.channels[channel] ? bot.channels[channel].last_message_id : null;
		if (!startID) return;
	} catch (err) {
		console.error(ut() + '[clearOldMessages] Error (recovered): ', err);
		return;
	}

	console.log(ut() + '[clearOldMessages ==>] [' + channel + '] [' + startID + '] [' + config.discord.purgeMaxDays + ']');

	bot.getMessages({channelID: channel, limit: limit, before: startID}, (err, res) => {
		if (err) {
			console.error(ut() + '[clearOldMessages] Error: ', err);
			clearOldMessagesComplete = true;
		}
		if (res) {
			let len = res.length;
			var lastMsg = res[len-1];
			msgsSeen += len;
			console.debug(ut() + '[clearOldMessages] found ' + len + ' messages');
			for (let i=0; i<len-1; i++){
				lastID = res[len-1].id;
				let timestamp = res[i].timestamp;
				let id = res[i].id;
				if (res[i].pinned) continue; // Don't delete pinned messages

				// example output: 7 months ago, 3 days ago, 2 days ago, a day ago, 2 hours ago, in a day, in 2 days
				let diff = moment(timestamp).startOf('minutes').fromNow();
				console.debug(ut() + '[clearOldMessages] checking [' + id + '], ' + diff);
				if (diff.indexOf('months') > -1 || diff.indexOf('year') > -1 || diff.indexOf('a month') > -1) {
					console.log(ut() + '[clearOldMessages] ' + diff + ", pushing onto SINGLE queue");
					singleDeleteQueue.push(id);
				}
				if (diff.indexOf('days ago') > -1) {
					let days = diff.match(/(\d+)/)[0];
					if (days >= config.discord.purgeMaxDays) {
						if (days < 14) {
							console.log(ut() + '[clearOldMessages] ' + diff + ", pushing onto BULK queue");
							bulkDeleteQueue.push(id);
						} else {
							console.log(ut() + '[clearOldMessages] ' + diff + ", pushing onto SINGLE queue");
							singleDeleteQueue.push(id);
						}
					}
				}
			}

			if (!len) { // Temp, testing
				console.log(ut() + '[clearOldMessages] completing.');
				clearOldMessagesComplete = true;
			} else {
				let diff = moment(lastMsg.timestamp).startOf('minutes').fromNow();
				console.log(ut() + '[clearOldMessages] recursing last ID = [' + lastID + ' (' + lastMsg.id + ')], diff = ' + 
					diff + ', len = ' + len);
				return setTimeout(function() {
					clearOldMessages(channel, lastID);
				}, 1500);
			}
		}

		console.log(ut() + '[clearOldMessages] complete? ', clearOldMessagesComplete);
		console.log(ut() + '[clearOldMessages] saw ' + msgsSeen + ' messages.');
		if (clearOldMessagesComplete && bulkDeleteQueue.length) {
			console.log(ut() + '[clearOldMessages] deleting ' + bulkDeleteQueue.length + ' BULK messages.');
			console.log(ut() + '[clearOldMessages] deleting ' + singleDeleteQueue.length + ' SINGLE messages.');
			let deleteTimeout = 5000;
			console.log(ut() + '[clearOldMessages] deleting queue in ' + deleteTimeout + ' ms');
			setTimeout(function() {bulkDeleteOldMsgs(channel)}, deleteTimeout);
		} else {
			if (clearOldMessagesComplete && singleDeleteQueue.length) {
				console.log(ut() + '[clearOldMessages] deleting ' + singleDeleteQueue.length + ' SINGLE messages.');
				singleDeleteOldMsgs(channel);
			}
		}

		if (err) return err;
	});
}

//////////////////////////////////////////////////////////////////////
//
// Delete messages from the queue created, above, in bulk. And reset.
// Discord does not allow messages older than 14 days to be deleted
// in bulk, only individually.
//
//////////////////////////////////////////////////////////////////////

async function bulkDeleteOldMsgs(channel) {
	const len = bulkDeleteQueue.length;
	const count = Math.floor(len / limit);
	const rem = len % limit;
	var delCount = 0;
	const start = new Date().getTime();

	console.log(ut() + '[bulkDeleteOldMsgs] length = ' + bulkDeleteQueue.length);
	console.log(ut() + '[bulkDeleteOldMsgs] count = ' + count);

	if (bulkDeleteQueue.length == 1) { // Prevent error 50016, not enough messages.
		singleDeleteQueue.push(bulkDeleteQueue.pop());
		return singleDeleteOldMsgs(channel);
	}

	// Delete in chunks of 100 ('limit')
	for (let i=0; i<count; i++) {
		var delArray = bulkDeleteQueue.slice(i*limit, (i+1)*limit);
		console.log(ut() + '[bulkDeleteOldMsgs1] slicing from ' + i + ' to ' + (i+1)*limit);
		if (delArray.length) {
			let timeout = (i+1)*5000;
			let useArray = util.deepCopy(delArray);
			console.log(ut() + '[bulkDeleteOldMsgs1] setting timeout: ' + timeout + ' milliseconds');
			setTimeout(function() {
				console.log(ut() + '[bulkDeleteOldMsgs1] deleting ' + useArray.length + ' messages (' + timeout + ')');
				bot.deleteMessages({channelID: channel, messageIDs: useArray}, (err, res) => { 
					if (err) {
						if (err.statusCode == 429) {
							console.log(ut() + '[bulkDeleteOldMsgs1]: ' + err.statusCode + ' ' + err.statusMessage +
								': ' + err.response.message + ' retry_after: ' + err.response.retry_after);
						} else if (err.statusCode == 400 && 
							(err.response.code == 50034 || // Invalid message ID
							rr.response.code == 50016)) { // too few messages, or too many.
							console.log(ut() + '[bulkDeleteOldMsgs1]: ' + err.statusCode + ' ' + err.statusMessage +
								': ' + err.response.message);
						} else {
							console.log(ut() + '[bulkDeleteOldMsgs1] Error: ', err);
						}
						return err;
					} else {
						delCount += useArray.length;
						console.log(ut() + '[bulkDeleteOldMsgs1] successfully deleted:' + 
							useArray.length + ' messages, total ' + delCount + ' of ' + len);
						console.log(ut() + '[bulkDeleteOldMsgs1] Elapsed time: ' + util.getElapsed(start));
					}
				})}, 
			timeout);
		}
	}

	// Then delete the remainder.
	delArray = bulkDeleteQueue.slice(count*limit);
	console.log(ut() + '[bulkDeleteOldMsgs2] slicing from ' + (count*limit) + ' to end.');
	let timeout = (count+1)*5000;
	if (delArray.length) {
		let useArray = util.deepCopy(delArray);
		console.log(ut() + '[bulkDeleteOldMsgs2] setting timeout: ' + timeout + ' milliseconds');
		setTimeout(function() {
			console.log(ut() + '[bulkDeleteOldMsgs2] deleting ' + useArray.length + ' messages (' + timeout + ')');
			bot.deleteMessages({channelID: channel, messageIDs: useArray}, (err, res) => { 
				if (err) {
					if (err.statusCode == 429) {
						console.log(ut() + '[bulkDeleteOldMsgs2]: ' + err.statusCode + ' ' + err.statusMessage +
							': ' + err.response.message + ' retry_after: ' + err.response.retry_after);
					} else {
						console.log(ut() + '[bulkDeleteOldMsgs2] Error: ', err);
					}
					return err;
				} else {
					delCount += useArray.length;
					console.log(ut() + '[bulkDeleteOldMsgs2] successfully deleted:' + 
							useArray.length + ' messages, total ' + delCount + ' of ' + len);
					console.log(ut() + '[bulkDeleteOldMsgs2] Elapsed time: ' + util.getElapsed(start));
					console.log(ut() + '[singleDeleteOldMsgs] deleting ' + singleDeleteQueue.length + ' messages singly.');
					singleDeleteOldMsgs(channel); // After delay!!!
				}
			})}, 
		timeout);
	} else {
		console.log(ut() + '[singleDeleteOldMsgs] deleting ' + singleDeleteQueue.length + ' messages singly.');
		singleDeleteOldMsgs(channel);  // After delay!!!
	}

	// Reset vars used to scan for old messages
	bulkDeleteQueue.length = 0;	
	lastID = 0;
	initialMessage = 0; 
	clearOldMessagesComplete = false;
}

//////////////////////////////////////////////////////////////////////
//
// To get around the fact that Discord does not allow messages older 
// than 14 days to be deleted in bulk, delete anything older one by one.
//
//////////////////////////////////////////////////////////////////////

const singleDeleteTimeout  = 3000;
function singleDeleteOldMsgs(channel) {
	if (!singleDeleteQueue || !singleDeleteQueue.length) return;
	let id = singleDeleteQueue.pop();
	console.log(ut() + '[singleDeleteOldMsgs] deleting [' + id + '] remaining ' + singleDeleteQueue.length);
	bot.deleteMessage({channelID: channel, messageID: id}, (err) => { 
		if (err) {
			if (err.statusCode == 429) {
				console.log(ut() + '[singleDeleteOldMsgs]: ' + err.statusCode + ' ' + err.statusMessage +
					': ' + err.response.message + ' retry_after: ' + err.response.retry_after);
				singleDeleteQueue.push(id);
				setTimeout(function(){singleDeleteOldMsgs(channel)}, err.response.retry_after + 100);
			} else {
				console.log(ut() + '[singleDeleteOldMsgs] Unable to delete message: '+ err.statusCode + ' ' + err.statusMessage +
					': ' + err.response.message + ' [' + err.response.code + ']');
			}
		} else {
			console.log(ut() + '[singleDeleteOldMsgs] Success.');
			setTimeout(function(){singleDeleteOldMsgs(channel)}, singleDeleteTimeout);
		}
	});
}

//////////////////////////////////////////////////////////////////////
//
// Helpers to track sent messages. There's an issue where duplicates
// appear in Discord, these are designed to detect and prevent that.
// However, I'm not sure why this occurs, yet.
//
//////////////////////////////////////////////////////////////////////

// Save an array of messages received - just their ID's
// The messages aren't large, we could save the entire
// message and do the comparison on element.messageId
function saveMessageId(message) { 
	if (!message || message.messageId == 0) return;
	if (msgArray.length > msgArrayMax) msgArray.shift();
	msgArray.push(message.messageId);
	if (msgArray.length > stats.MaxSendQLen) stats.MaxSendQLen = msgArray.length;
}

// See if a message is already in the above array.
function isMsgSent(message) {
	let msgID = message.messageId;
	if (!msgID) return false;
	let found = msgArray.find(element => element == msgID);
	if (!found || found == undefined) return false;
	return found;
}

////////////////////////////////////////////////////////////////////////////////
//
// This queue saves banker requests, and pops them off the queue
// after a time interval. A second banker request won't be forwarded
// to Disord until the timer pops (the sender isn't on the queue anymore)
//
// See also function letBankerKnow(){}
//
////////////////////////////////////////////////////////////////////////////////

var bankerSentQueue = [];
function addIdTobankerSentQueue(id) {
	let bankReq = {'id': id, 'timerHandle': 0};
	bankReq.timerHandle = setTimeout(function(){bankerQueueCB(id);}, util.minToMs(config.api.bankerQueueMin));
	bankerSentQueue.push(bankReq);
}

// Function to see how much is left on the timer (by id)
function timeLeftOnQueue(id) {
	let found = bankerSentQueue.filter(e => id == e.id);
	if (found[0]) {
		let timeLeftMs = util.timerGetTimeLeft(found[0].timerHandle);
		return util.millisecondsToHuman(timeLeftMs);
	}

	return '<unknown>';
}

// Checks to see if a user is already on the queue, by id
function isOnBankerSendQueue(id) {
	let found = bankerSentQueue.filter(e => id == e.id);
	console.debug(ut() + '[isOnBankerSendQueue]: ', found);
	if (found[0]) if(found[0].id == id) return true;
	return false;
}

// Called when timer pops to remove from array
function bankerQueueCB(id) {
	for(let i = 0; i < bankerSentQueue.length; i++) {
        if (bankerSentQueue[i].id === id) { 
            bankerSentQueue.splice(i, 1);
            break; 
        }
	}
}

function emptyBankerSetQueue() {
	let e = bankerSentQueue.pop();
	while (e) {
		clearTimeout(e.timerHandle);
		e = bankerSentQueue.pop();
	}
}

////////////////////////////////////////////////////////////////////////////////
//
// Functions to interact with the Torn API
//
////////////////////////////////////////////////////////////////////////////////

const facUpgradesURL = 'https://api.torn.com/faction/?comment=' + 
						config.discord.appUserName + '&selections=upgrades&key='  + config.web.apikey;

// Query the Torn API
function getFacUpgrades(upgrade, message) {
	console.log(ut() + '[getFacUpgrades] ' + upgrade);
	if (config.web.apikey == '') {
		console.log(ut() + " **** Missing API key! ****");
		return;
	}

	// Aliases
	if (upgrade == 'gymgains') upgrade = 'steadfast'; // 'gymgains' is an alias.
	if (upgrade == 'travel') upgrade = 'excursion'; // 'travel' is an alias.
	if (upgrade == 'crimes') upgrade = 'criminality'; // '...' is an alias.
	if (upgrade == 'nerve') upgrade = 'criminality'; // '...' is an alias.

	fetch(facUpgradesURL).then(res => {
	    if (res.status != 200) {
	        console.log(ut() + "[getFacUpgrades] Bad response from server", res.status, ' ', res.statusText);
	    }
	    if (res.error) {
	    	console.log(ut() + "[getFacUpgrades] response error", error);
	    }
	    return res.json();
    }).then(data => {
	    processFacUpgradesRes(data, upgrade, message);
	    return "200 OK";
    }).catch(err => {
    	console.log(ut() + "[getFacUpgrades] error");
        console.error(err);
        sendDiscord("```Oops! Unable to get fac upgrades right now.\nI'm working on fixing it!```");
    });
}

// process the result
function processFacUpgradesRes(jsonObj, upgrade, message) {
	let upgrades = jsonObj.upgrades;
	let keys = Object.keys(upgrades);
	let title = util.capitalize(upgrade) + ' Branch';
	let text = '';
	let chatText = ''; 
	for (let i=0; i<keys.length; i++) {
		if (upgrades[keys[i]].branch.toLowerCase() == upgrade) {
			let ability = upgrades[keys[i]].ability;
			text += '\t' + ability + '\n';

			switch (upgrade) {
				case 'steadfast':
					let num = ability.match(/(\d+)/)[0];
					let stat = ability.split(' ')[1].substring(0, 3);
					if (chatText) chatText += ', ';
					chatText += util.capitalize(stat) + ': +' + num + '%';
					break;
				case 'excursion':
					if (ability.indexOf('Increases maximum trav') > -1) {
						chatText += ability;
					}
					break;
				default:
					break
			}
		}
	}

    postEmbedToDiscord(title, text);
    if (chatText && message.type != 'dev') {
    	console.log(ut() + 'Chat Text:');
    	console.log(chatText);
    	sendChatOnly(chatText);
    }
}




