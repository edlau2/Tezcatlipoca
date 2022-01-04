
// Files just to include some common stuff. Really only need cross-fetch for this example
const fetch = require('cross-fetch');

const path = require('path'); // For script name. Not required.

// Used to get your API key, and some basic utilities that aren't used here.
const config = require('./config.js');
const util = require('../Utilities/utilities.js');

// Just some debugging stuff.
console.debug = config.debug ? util.debug : function(){}; // To enable/disable debug only logging
const ut = function() {return (util.timestamp() + ' ')}; // For logging
const scriptName = path.basename(module.filename, path.extname(module.filename)); // For logging

/********************************************************************************
*
* Main entry point point: calls main() and waits for the call to get the attack log
*
********************************************************************************/

// Call the function that kicks things off. Typicalls, this would be a fn
// to start a web server, open a DB, or anything else that runs async and takes a momemnt,
// such as 'startWebServer()', 'initDatabase()', etc.
// See the template file for some more details

console.log(ut() + ' ' + scriptName + ' is kicking things off...');
main();

async function main() { // Needs to be async to use await. Otherwise, use the normal promise.then() method.
	console.log('\n\n' + ut() + '[main] Starting ' + scriptName + '\n\n');

	// can do this two ways: await basically converts the asyc call into a sync call
	console.log(ut() + '[main] calling "getAttackLog()",,,');

	let result = await getAttackLog(); // Will wait here until the async call completes.

	// Any code here will NOT run until the async call completes.
	if (result.error) {
		console.log('\n\n' + ut() + '[main] getAttackLog returned an error: ', result.error);
	} else {
		console.log('\n\n' + ut() + '[main] getAttackLog returned Success: ', result.status);
		console.log(ut() + '[main] Your batstats: ', result.data, '\n\n');
	}


	//process.exit(); // Would just exit here anyways...

	// Alternate way to wait for promise to complete, can be chained
	/*
	getAttackLog().then(result => {
		if (result.error) {
			console.log('\n\n' + ut() + '[main] getAttackLog returned an error: ', result.error);
		} else {
			console.log('\n\n' + ut() + '[main] getAttackLog returned Success: ', result.status);
			console.log(ut() + '[main] Your batstats: ', result.data, '\n\n');

			// can call another promise here (or a sync fn)
		}
	});

	// Any code here will run right away while the async call runs in the background
	*/
}


// Simple function to query the Torn API, return a promise.
// fetch() itself is async, so this entire function is.
function getAttackLog() {
  let url = 'https://api.torn.com/user/?selections=battlestats&key=' + config.api.key;
  console.log(ut() + '[getAttackLog] url = ' + url);

  try {
      return new Promise(function(resolve, reject) {
          console.log(ut() + '[getAttackLog] calling fetch()');
          fetch(url).then(res => { // Gets the result
              res.text().then(text => { // Gets the result body
                  let jsonObj = JSON.parse(text); // Gives us a JSON obj with batstats
                  resolve({error: null, status: '200 OK', data: jsonObj}); // Resolves the promise
              });
          });
      });
    } catch(e) { // Exception handler
        console.error(ut() + '[getAttackLog] Exception: ', e);
        result = {error: e, status: 'error'};
        reject(result); // Rejects the promise
    }
}