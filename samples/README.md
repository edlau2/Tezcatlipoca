## Samples

test.js - a sample of a simple program that uses cross-fetch to get your batstats from the Torn API. Shows how to use
promises in two ways, the normal "promise.then()" way and the newer "await", which basically converts an async call into a sync call.
I make tons of these to test simple functions before integratng them into my main scripts. I have others to start a simple bot, another
to start a websocket client to intercept chats, etc.

node-js-template.js - a simple template with common requires and some code blocks to set up a web server, open a database, install signal
handlers to trap exit events, handle a clean shutdown, chain some async calls, etc. I use this as a common starting point for most scripts.
Requires a config file, modify the one you have as appropriate for the cause.

go.js - just a simple way to be able to type 'node go' from any project folder to launch your script without having to type the whole name.
Enter the name once in this file and forget about it.
