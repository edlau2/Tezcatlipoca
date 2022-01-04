 
module.exports = {
  enableLogfileOutput,
  installSignalHandlers,
  getElapsed,
  millisecondsToHuman,
  debug,
  asCurrency,
  numberWithCommas,
  integerWithCommas,
  datetimenow,
  timestamp,
  datenow,
  deepCopy,
  daysToYMD,
  formatYMD,
  quit,
  delay,
  hourToMs,
  minToMs,
  getRandomInt,
  pidIsRunning,
  capitalize,
  timerGetTimeLeft,
  stripPunctuation
}

/*
 * Set up to mirror console output to a logfile
 */
 function enableLogfileOutput(filename, mode='w') {
  const util = require('util');
  var logFile = require('fs').createWriteStream(filename + '.log', { flags: mode });
  var logStdout = process.stdout;
  console.log = function () {
    logFile.write(util.format.apply(null, arguments) + '\n');
    logStdout.write(util.format.apply(null, arguments) + '\n');
  }
  console.error = console.log;
}


/**
 * Install hooks/handlers for SIGTERM and SIGINT
 */

function installSignalHandlers(_callback) {
  var callback = _callback;

  // Handle SIGTERM/SIGINT - termination processing.
  // SIGTERM forces process.exit(), SIGINT is gracefull,
  // will call registered callback.
  process.on('SIGTERM', () => {
    console.log('Caught SIGTERM: performing hard shutdown.');
    setTimeout(function() {process.exit();}, 500);
    /*
    if (typeof callback == "function") {
        callback();
      } else {
        _processExit();
      }
    */
  });

  process.on("SIGINT", function () {
    console.log('Caught SIGINT: performing graceful shutdown.');
    if (typeof callback == "function") {
        callback();
      } else {
        _processExit();
      }
  });


// Global unhandled exception handler
process.on('uncaughtException', function(err) {
  console.log('\nCaught unhandled exception: ', err);
  console.log('\nI suggest using try/catch around problematic code, or in promises, .catch');
  console.log('In either case, uncaught exceptions should be handled by a gracefull');
  console.log('termination, as the app may be in an unstable state.\n');
});

  // Attempt to handle SIGSTP - which suspends the process
  // and forces to the background.
  process.on("SIGSTP", function () {
    console.log('Caught SIGSTP: process will be shunted to the background!');
    console.log('Will attempt to kill instead.');
    process.emit("SIGTERM");
  });

  // Trap SIGINT, on Win32 and elewhere (such as my Mac)
  if (process.platform === "win32") {
    var rl = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.on("SIGINT", function () {
      process.emit("SIGTERM");
    });
  }
}

// Default exit handler
function _processExit() {
  console.log('Default termination processing - replace with your own!');
}

// Function to see how much time left in a timer
// Use the handle returned by setTimeout/setInterval as the param
function timerGetTimeLeft(timeout) {
    return Math.ceil((timeout._idleStart + timeout._idleTimeout - Date.now()) / 1000);
}

 /**
 * Helpers to get elapsed time and format ms to hh:mm:ss
 */

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

// Over-riding console.debug:
// At the top of each file, 'console.debug = config.debug ? Utilities.debug : function(){};'
//var isDebugMode = true;
function debug(/* ...args */) {
    //if(isDebugMode) {
        var vargs = Array.prototype.slice.call(arguments);
        console.log.apply(this, vargs);
    //}
}

/*
// or ES6 style
console.debug = (...args) => {
    if(isDebugMode) {
        console.log.apply(this, args)
    }
}
*/

// Insert a blocking delay
//const delay = ms => new Promise(res => setTimeout(res, ms));
async function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// Convert hours to ms
function hourToMs(hours) {
  return hours * 60 * 60 * 1000;
}

function minToMs(min) {
  return min * 60 * 1000;
}

// Function to strip punctuation from a string
function stripPunctuation(s) {
  var punctuationless = s.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
  return punctuationless.replace(/\s{2,}/g," ");
}

// Return a random int, 0 up to 'max', inclusive.
function getRandomInt(max) {
  return Math.floor(Math.random() * (max+1));
}

// Capitalize a word
function capitalize(word) {
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

// Determine if a process is running, by PID
function pidIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch(e) {
    return false;
  }
}

/**
 * Return a number formatted as a string as currency
 * 
 * @param {num} - number to format
 * @return string of {num}, formatted as currency
 */
function asCurrency(num) {
  var formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',

      // These options are needed to round to whole numbers if that's what you want.
      minimumFractionDigits: 0, // (this suffices for whole numbers, but will print 2500.10 as $2,500.1)
      maximumFractionDigits: 0, // (causes 2500.99 to be printed as $2,501)
  });
  return formatter.format(num);
}

// Add commas at thousand place - works with decimal numbers
function numberWithCommas(x) {
    var parts = x.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
}

// Add commas at thousand place, strip decimal places
function integerWithCommas(x) {
    var parts = x.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts[0];
}

/**
 * Function used to get time formatted as: mm/dd/yyyy 00:00:00 TCT
 * 
 * @param {none}
 * @returns {string} date formatted as mm/dd/yyyy 00:00:00 TCT with current time.
 */
function datetimenow() {
  let now = new Date();
  let formatted = 
    (now.getUTCMonth() + 1).toString().padStart(2, '0') + "/" +
    now.getUTCDate().toString().padStart(2, '0') + "/" +
    now.getUTCFullYear().toString().padStart(2, '0') + " " +
    now.getUTCHours().toString().padStart(2, '0') + ":" +
    now.getUTCMinutes().toString().padStart(2, '0') + ":" +
    now.getUTCSeconds().toString().padStart(2, '0') + " TCT";
  return formatted;
}

function datenow() {
  let now = new Date();
  let formatted = 
    (now.getUTCMonth() + 1).toString().padStart(2, '0') + "/" +
    now.getUTCDate().toString().padStart(2, '0') + "/" +
    now.getUTCFullYear().toString().padStart(2, '0');
  return formatted;
}

// Function to get time as HH:MM:SS
function timestamp() {
  return (new Date().toLocaleTimeString());
}

// Helper: Perform an array deep copy
function deepCopy(copyArray) {
    return JSON.parse(JSON.stringify(copyArray));
}

// Helper: quit the process
function quit() {
  process.emit("SIGTERM");
}

// Returns years, months, and days in a number of days, roughly
function daysToYMD(qty) {
   let m = 0, y = 0, d = 0; //, w = 0;
   while(qty) {
      if( qty >= 365) {
         y++;
         qty -= 365;
      } else if (qty >= 30){
         m++;
         qty -= 30;
      //}else if(d >= 7){
      //   w++;
      //   d -= 7;
      } else {
         d++;
         qty--;
      }
   };
   return {years: y, months: m, days: d};
};

// Format the above as '(x years, y months, z days)'
function formatYMD(ageAsYMD) {
  let ageAsYMDStr = '(';
  if (ageAsYMD.years) ageAsYMDStr += ageAsYMD.years + ' years';
  if (ageAsYMD.months || ageAsYMD.days) ageAsYMDStr += ' ' ;
  if (ageAsYMD.months) ageAsYMDStr += ageAsYMD.months + ' months';
  if (ageAsYMD.days) ageAsYMDStr += ' ';
  if (ageAsYMD.days) ageAsYMDStr += ageAsYMD.days + ' days';
  ageAsYMDStr += ')';

  return ageAsYMDStr;
}

