/********************************************************************************
 *  
 * File: chat-client.js
 * 
 * A simple command line client for Torn
 * 
 *******************************************************************************/

/**
 * Global variables
 */

const WebSocket = require('ws');
const fs = require('fs');
const http = require('http');

var config = require('./config.js'); // 'var' to reload on the fly.
const status = require('../Utilities/http-status.js');
const util = require('../Utilities/utilities.js');

const facRoomID = config.web.roomId;

const defConsoleDebug = console.debug;
if (!config.debug) console.debug = function(){};
const ut = function() {return (util.timestamp() + ' ')};

var messageQueue = []; // Global message queue
var internalHandleQueue = []; // Handles that need to be closed before termination
var msgArray = []; // Saved message ID's
const msgArrayMax = config.api.savedMsgsmax; // Max array length
var globalWS = null; // Global WebSocket
var rl = null; // GLobal readline for input

/********************************************************************************
 *  
 * Main entry point
 * 
 *******************************************************************************/

console.log('\n' + ut() + 'Starting chat-client.js:\n\tPID = ' + process.pid + '\n\tPlatform: ' + process.platform);

// Traps various signals to abort, quit, run under a debugger, etc.
util.installSignalHandlers(myProcessExit);

// Open the WebSocket for chat
globalWS = newSocket();
installSocketHandlers(globalWS);

// Handle termination events.
var terminationStarted = false;
async function myProcessExit() {
	console.log('\n\nmyProcessExit: terminationStarted? ', terminationStarted);
	if (terminationStarted) return; // Do only once.
	terminationStarted = true;

	if (rl) {
	console.log(ut() + 'Closing readline interface...');
	rl.close();
	}

	console.log(ut() + 'Closing WebSocket...');
	config.web.attemptRecovery = false; // Don't re-open if we closed ourselves!!
	if (globalWS) globalWS.close();


	console.log(ut() + 'Closing interval handles...');
	let handle = internalHandleQueue.pop();
	while (handle) {
		clearTimeout(handle);
		handle = internalHandleQueue.pop();
	}

	finalTerm();
}

function finalTerm() {
	console.log(ut() + 'Terminating process...');
	setTimeout(function() {
		console.log(ut() + 'Calling process.exit().');
		process.exit();
	}, 1000);
}

//////////////////////////////////////////////////////////////////////
// Install handlers for a socket. Done here (in a separate function)
// so we can easily retry a failed/closed socket.
//////////////////////////////////////////////////////////////////////

/*
Message types:

Message received:  {
  idle: false,
  online: true,
  roomId: 'Users:Arcy102,xedx;2100735;2575997',
  sequenceNumber: 0,
  type: 'onlinestatus'
}

Message received:  {
  idle: false,
  online: true,
  roomId: 'Users:Arcy102,xedx;2100735;2575997',
  sequenceNumber: 0,
  type: 'onlinestatus'
}

Message received:  {
  messageId: '1641183883-9279707',
  messageText: "New party rule. If you're going to rub masks with strangers, bring your own mask.",
  roomId: 'Global',
  senderId: '1285627',
  senderIsStaff: false,
  senderName: 'Artemis',
  sequenceNumber: 36166941,
  time: 1641183883,
  type: 'messageReceived'
}

*/

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
            if (message.type != 'onlinestatus') {
            	console.log('[' + message.roomId + '] ' + message.senderName + ': ' + message.messageText);
            }
            if (message.roomId === facRoomID && message.hasOwnProperty("messageText")) {
            	if (message.senderName == 'xedx') return console.log('...');
                console.log(message.senderName + ': ' + message.messageText);
                return;
            }
        }
    };

    // Handle 'ping/pong'
    globalWS.on('pong', function() {
    	if (!config.api.silentPing) console.debug(ut() + '[PONG]');
    	if (pingTimeout) clearInterval(pingTimeout);
    });

    globalWS.on('ping', function() {
    	if (!config.api.silentPing) console.debug(ut() + '[PING]');
    	sendPong();
    });

    // Handle socket open event.
    globalWS.onopen = function() {
    	console.log(ut() + 'WebSocket client connected.');
    	socketRetries = 0;
    	startChatClient();
    	sendPing();
    	//installInternalHandlers();
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

function startChatClient() {
	rl = require('readline').createInterface({
	  input: process.stdin,
	  output: process.stdout,
	  prompt: 'xedx: '
	});

	console.log('\n\nTorn Chat Client by XedX is up and active, talking to room ID [' + config.web.roomId + ']\n\n');

	rl.prompt();

	rl.on('line', (input) => {
      //console.log(`Received: ${input}`);
      sendChat(input);
    });

    rl.on('pause', () => {
  		console.log('Readline paused.');
	});

	rl.on('resume', () => {
	  console.log('Readline resumed.');
	});

	rl.on('SIGCONT', () => {
	  // `prompt` will automatically resume the stream
	  rl.prompt();
	});

	rl.on('SIGINT', () => {
	  rl.question('Are you sure you want to exit? ', (answer) => {
	    if (answer.match(/^n(o)?$/i)) {
	    	rl.pause();
	    } else {
	    	myProcessExit();
	    }
	  });
	});

	rl.on('SIGTSTP', () => {
	  // This will override SIGTSTP and prevent the program from going to the
	  // background.
	  console.log('Caught SIGTSTP.');
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

const chat =  {"proc":"rooms/sendMessage",
			   "data":{
			        "roomId":[config.web.roomId],
			        "messageText":[""]
			        },
			   "v":4};

function sendChat(messageText, type=null) {
	if (globalWS.readyState != 1) return;
	//console.debug('[internal send] ' + messageText);
	let msg = util.deepCopy(chat);
	msg.data.messageText[0] = messageText;
	globalWS.send(JSON.stringify(msg));
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

// Send a 'ping'
var pingTimeout = null;
function sendPing() {
	if (globalWS.readyState != 1) return;
	if (!config.api.silentPing) console.log(ut() + '[PING]');
	pingTimeout = setTimeout(pingCB, 10000); // Allow 10 secs to record missed PONG
	globalWS.ping();
}

// Called on ping timeout
function pingCB() {
	let msg = ut() + '[PING] no response! (missed PONG), ' + stats.latePong + ' missed!';
	/*if (!config.api.silentPing)*/ console.log(msg);
}

// Respond with a 'pong' (not yet tested)
function sendPong() {
	if (!config.api.silentPing) console.log(ut() + '[PONG]');
	globalWS.pong();
}






