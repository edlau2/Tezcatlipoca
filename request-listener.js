/***********************************************************************************
 * 
 * File: request-listener.js
 * 
 * Request listener. Handles simple commands, mainly for debugging or
 * stopping the process. Could be used to run as a cron scheduled job.
 * Current commands: 
 *    'quit', 'exit' : stops the process.
 *    'help' : list commands accepted
 *    'go' : executes once.
 *    'import' : Import faction names/ID's froma CSV
 *    anything else responds with an "I'm alive" message.
 * 
 * Example: curl http://localhost:8001/facchat/?cmd=import&file=./factionlist.csv
 * 
 ************************************************************************************/

const helpMsg = `Commands (cmd): message, test, quit, exit, help.\n` +
                `For example: curl "http://localhost:8001/facchat/?cmd=message&msg=@banker"\n` +
                `Note that the quotes are required, as is the facchat endpoint.\n`;
const URL = require('url');
const config = require('./config.js');
const chat = require('./facchat.js');

/*
const devMessage = {'senderName': 'developer', 
                  'senderId': 'xedx', 
                  'sequenceNumber': 0, 
                  'messageId': 0, 
                  'state:': 'dequeued', 
                  'type': 'dev',
                  'messageText': ''};
*/

/***********************************************************************************
 * RequestListener: Responds to HTTP requests
 ***********************************************************************************/

module.exports.requestListener = function (req, res) {
    let url = URL.parse(req.url, true);
    let query = url.query;
    let path = url.pathname;
    let cmd = query ? query.cmd : null;
    let msg = query ? query.msg : null;

    console.debug('req.url: ' + req.url);
    console.debug('URL: ', url);
    console.debug('query: ', query);
    console.debug('path: ' + path);
    console.debug('cmd: ' + cmd);
    console.debug('msg: ' + msg);

    let defMsg = "I'm not dead yet!\n";

    console.log('Request handler, command = ' + cmd + '\n');

    if (path.indexOf('favicon') != -1) return res.end();
    if (!cmd || path.indexOf('facchat') == -1) {return res.end("I'm not dead yet!\n" + helpMsg);}

    try {
      res.setHeader("Content-Type", "text/html");
      switch (cmd) {
          case "message": { // Requires "?cmd=message&msg=<message_text>"
            res.writeHead(200);
            if (!msg) {return res.end('Requires "&msg=<message_text>"" !!!\n');}
            let useMsg = config.api.devMsg;
            useMsg.messageText = msg;
            chat.postMessageToDiscord(useMsg);
            res.end('200 OK  - message: "' + useMsg + '" sent.\n');
            break;
          }

          case "test": {
            res.writeHead(200);
            res.end('test command complete, does nothing ATM.\n');
            break;
          }

          case "exit":
          case "quit":
            res.writeHead(200);
            res.end('Process exit requested: sending SIGTERM.\n');
            process.kill(process.pid, 'SIGTERM');
            break;

          case "help":
            res.writeHead(200);
            res.end(helpMsg);
            break;

          default:
            res.writeHead(404);
            msg = "Command not found: " + cmd + '\n' + helpMsg + '\n';
            res.end(defMsg);
            break;
      }
    } catch (error) {
      console.trace("Fatal Error:", error);
      sp._quit();
    }
}

/*******************************************************************************
 * Helpers to get elapsed time and format ms to hh:mm:ss
 ******************************************************************************/

function getElapsed(start) {
  return millisecondsToHuman(new Date().getTime() - start);
}

function millisecondsToHuman(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / 1000 / 60) % 60);
  const hours = Math.floor((ms  / 1000 / 3600 ) % 24)

  const humanized = [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0'),
  ].join(':');

  return humanized;
}




