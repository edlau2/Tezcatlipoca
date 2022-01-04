#!/usr/bin/env node
/********************************************************************************
 *  
 * File: template.js
 * 
 * Generic template to assist in rapid prototyping.
 * 
 *******************************************************************************/

/**
 * Global variables
 */
const sqlite3 = require('sqlite3').verbose();
const http = require('https');
const path = require('path');

/*
const requesters  = {
  http:     require('http'),
  https:    require('https')
};
*/

const fs = require('fs');
//const fetch = require('cross-fetch');
//const Discord = require('discord.io');

const scriptName = path.basename(module.filename, path.extname(module.filename));

const listener = require('./request-listener.js'); // For web server
const config = require('./config.js'); // Label by name , eg, scriptName.config.js ?
const util = require('../Utilities/utilities.js');

console.debug = config.debug ? util.debug : function(){};
const ut = function() {return (util.timestamp() + ' ')};

var timeoutId = null; // setTimeout()/setInterval() id, if we need to cancel.

const tornHostName = config.api.host;
const apiKey = config.api.key;

var db = null;
var bot = null;
var server = null;
 

// Validate the API key before doing anything. Only required when using the Torn API.
// We only check for this if the Torn host name is in the config file
if (tornHostName && (!config.api.key || config.api.key == '')) {
  console.log('\n**********************************************************');
  console.log('\nAPI key not present!\n');
  console.log('Please enter your API key in the file config.js,');
  console.log('or define via the process environment variable, "TORNAPI_KEY".\n');
  console.log('See "config.api.key" in config.js')
  console.log('\n**********************************************************\n');
  return;
}

const serverReady = "\n\n" + ut() + "Server is up and ready, waiting on your command!\n";
const serverReadyFn = function() {
  console.log(serverReady);
  main();
};

/********************************************************************************
 *  
 * Main entry point
 * 
 *******************************************************************************/

util.installSignalHandlers(myProcessExit); // Handles SIGTERM/SIGINT, installs hooks for same on Win32/64

// Decide what we want to run: initWebServer(), initDatabase(), startBot().
// Completion of starts another....
// calling serverReadyFn() launches 'main()'

// For example - call initWebServer(), will call initDatabase() on listen, which will call
// main() via serverReadyFn(), which can call startBot(). Or, call startBot() which can call main()
// once connected (on open).

initWebServer();

function initWebServer() {
  server = http.createServer(listener.requestListener);

  server.listen(config.web.port, config.web.host, () => {
      console.log(ut() + scriptName + ` Server is running on http://` + server.address().address + `:` + server.address().port);
      initDatabase();
  });

  // Error event
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log(ut() + 'Address in use, retrying...');
      setTimeout(() => {
        server.close();
        server.listen(config.web.port, config.web.host);
      }, 1000);
    } else {
      console.log(ut() + "HTTP server error:", e);
      console.log(ut() + "Aborting process.");
      process.emit("SIGTERM");
    }
  });

  // Close event
  server.on('close', () => {
    console.log(ut() + "Web service closed successfully.");
  });
}

function initDatabase() {
  console.log(ut() + 'Initializing database...');
  openDatabase().then(
    result => {
      db = result.obj;
      let path = result.path;
      console.log(ut() + 'Resolved, DB loaded from ' + path);
      serverReadyFn();
    },
    error => {
      console.log(ut() + 'Reject: ' + error);
      myProcessExit();
    }
  );
}

/*
* Called once server is up and ready and DB is opened.
*/
function main() {
	let promise = FunctionXYZ();
	promise.then(
	  result => { // resolve
	  	console.log('FunctionXYZ returned: ', result);
	  	if (config.retryHours) {
	        console.log('\nWill run again in ' + config.retryHours + ' hour(s), please wait.');
	        timeoutId = setTimeout(main, config.retryHours * 60 * 60 * 1000);
        } else {
        	console.log('All done...will start termination soon.');
        	setTimeout(processExit, 5000);
        }
	  },
	  error => { // reject
	  	console.error('Error: ', error);
	  });
	

	process.exit();
}

/**
 * Actual termination events.
 */
var terminationStarted = false;
function myProcessExit() {
  terminationStarted = true;
	console.log('Cleaning up the ' + scriptName + ' process.');
	console.log('Clearing any pending processes....'); // setTimeout, setInterval...
	if (timeoutId) clearTimeout(timeoutId);
  
  // Whatever else needs to be done here:
  // Close DB's, close sockets, etc.

  if (db) {
    console.log(ut() + 'Closing database...');
    closeDatabase();
  }

  // Close the HTTP server
  console.log(ut() + "Closing web services...");
  server.close(() => {
    console.log(ut() + "Process terminating...\n\n");
    process.exit(0);
  });

  process.exit();
}

function FunctionXYZ() {
  return new Promise(res => {
    console.log("Hello, World!");
    resolve({Status: 'OK', msg: 'Hellow, World!'});
}

/*******************************************************************
 * 
 *                  Functions to access the Database 
 * 
 *******************************************************************/

/*******************************************************************
 * 
 * const function openDatabase() - Open (and create if not present) the database
 * 
 * @param {} none
 * @result {object} {msg: [success msg] db: [db handle] path: [db path]} 
 *         or {Error object}}
 * 
 * Note 'db' is global to this module (database handle)
 * 
 *******************************************************************/

function openDatabase() {
  let fullPath = config.db.path + '/' + scriptName + '.js'; // As opposed to 'config.db.file'
  console.log(ut() + `Connecting to the database at ${fullPath}.....`);
  return new Promise(function(resolve, reject) {
    console.debug(ut() + 'Verifying database folder exists....');
    try {
      if (!fs.existsSync(config.db.path) && !config.db.path.includes(':memory:')) {
        fs.mkdirSync(config.db.path)
      }
    } catch (err) {return reject(err);}

    db = new sqlite3.Database(fullPath, (sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE), (err) => {
      if (err) return reject(err);

      console.log(ut() + `Connected to the database at ${fullPath}.`);
      console.debug(ut() + 'Creating batstats table.');
      db.run(
        `CREATE TABLE IF NOT EXISTS my_table (
          rowid     INTEGER  PRIMARY KEY ASC,
          date      TEXT DEFAULT CURRENT_DATE,
          time      TEXT DEFAULT CURRENT_TIME
        )`,
        (err, result) => {
          if (err) {
            console.log(ut() + 'Error: ', err);
            return reject(err);
          } else {
            console.log(ut() + 'Table(s) created or already exist.');
            return resolve({msg: 'Table(s) created or already exist.', obj: db, path: fullPath});
          }
        },
      );
    });
  });
}

/*******************************************************************
 * 
 * const function closeDatabase() - Close the database
 * 
 * @param {none}
 * @return {nothing}
 * 
 * Note 'db' is global to this module (database handle)
 * 
 ******************************************************************/

const closeDatabase = function() {
  if (db) db.close();
  db = null;
  console.log('Database closed.');
}

//////////////////////////////////////////////////////////////////////
//
// Starts the bot, to notify Discord of events. On Success,
// calls serverReadyFn();
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

      serverReadyFn(); // Go!

    } catch (err) {
      console.error(ut() + '[DISCORD] on ready Error: ', err);
      myProcessExit();
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
      let roles = event.d.member.roles;
      console.log(ut() + '[DISCORD] Is committee: ', roles.includes(config.discord.roles.Committee));

      // Listen for messages that  start with `!` or '@'
      if (message.substring(0, 1) == '!' || message.substring(0, 1) == '@') {
         
      } // if '!' or '@'

    } catch (err) {
      console.error(ut() + '[DISCORD] on message Error: ', err);
      myProcessExit();
    }
  }); // end bot.on(message)

  bot.on('disconnect', function(errMsg, code) { 
    console.log(ut() + '[DISCORD] disconnect Error: ' + errMsg + ' Code: ' + code);
    if (code == 4012) {
      console.log("\n\n **** Don't forget custom Discord.io index.js changes! ****\n\n");
    }
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




