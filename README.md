# Fac Chat

This mirrors the faction chat from Torn to a faction Discord channel. The channel is defined by the webhook in config.js

Other than mirroring, it will accept commands from the fac chat window. Commands must be the first thing typed in chat.
For example, '@banker can I please have $100m?' will be mirrored to the banker channel as well as being visible in chat. 
Typing '@gymgains' would show current steadfast perks in chat (and Discord).

Periodically (by default every two hours, and soon after startup), old messages - older than two days by default - are erased from the chanel
where chat is mirrored.

For development/testing purposes, so as to not have to clutter up fac chat while testing, it also run as a web server if enabled 
via the config file. The option is 'config.web.listen = true;' By default, it is on http://localhost:8001/facchat. So to send a 
command, for example '@reload' (to reload the config file), you would use curl:

curl "http://localhost:8001/facchat/?cmd=message&msg=@reload"

Note that when using curl, you may have to escape the '!' when using that form of a command, definitely if using a bash shell:<br>

curl "http://localhost:8001/facchat/?cmd=message&msg=\!ping"

curl commands always come with a senderID of 'developer', which has access to developer/committee commands, as does a senderID
of 'xedx'. 

New! Now, you can type commands in Discord itself, if the option 'config.discord.listen' is set to TRUE in the config file. 

Commands are case-insensitive. They may be prefixed with either an '@' or an '!'.

General Commands, available to everyone:

**@help -or- !help:** Display this message.<br>
**@banker -or- !banker:** Mirrors request to the banker channels, and pings bankers.<br>
**@gymgains -or- !gymgains:** Outputs current fac gym gains specifics, an alias for 'steadfast'.<br>
**@steadfast -or- !steadfast:** Display current steadfast (gym gains) branch upgrades.<br>
**@toleration -or- !toleration:** Display current toleration (addiction) branch upgrades.<br>
**@aggression -or- !aggression:** Display current aggression (war perks) branch upgrades.<br>
**@suppression -or- !suppression:** Display current suppression branch (defense) upgrades.<br>
**@voracity -or- !voracity:** Display current voracity branch (consumables) upgrades.<br>
**@fortitude -or- !fortitude:** Display current fortitude (med stuff) branch upgrades.<br>
**@excursion -or- !excursion:** Display current excursion (travel) branch upgrades.<br>
**@criminality -or- !criminality:** Display current criminality (crimes/busts/nerve) branch upgrades.

Developer Commands, available to developers/committee (the sender's role is checked):

**@stats -or- !stats:** Outputs application statistics in Discord.<br>
**@reload -or- !reload:** Reads a possibly modified config.js file and uses new values.<br>
**@config -or- !config:** Output current app configuration in Discord.<br>
**@ping -or- !ping:** Sends a 'ping' message to the chat server.<br>
**@sigusr1 -or- !sigusr1:** Sends a SIGUSR1 signal (activate the Inspector API debugger).<br>
**@restart -or- !restart:** Restarts the process in about 5 seconds.<br>
**@terminate -or- !terminate:** Exits (completely stops) the process. Requires manual intervention to restart.<br>
**@abort -or- !abort**: Sends a SIGKILL, abortive termination. NOT recommended except in emergencies!<br>

TBD: Add command to terminate everything -but- the web server, so can be restarted remotely as well.
Sort of a 'semi-abort'.

## Installation/running:

Copy the files facchat.js, config.js, and request-listener.js into a directory of your choice, such as 
'./facchat'. Copy into ../Utilities the file 'Utilities.js'. The following packages, installed with npm, are required:
'ws', 'fs', 'cross-fetch', 'discord.io', 'moment', 'http' and 'url'. 'npm i <package>' will install them. To run, use node.js: 'node fachchat'.
I typically run as 'node --trace-warnings --inspect facchat'. '--inspect' enables node debugging (using Chrome) and '--trace-warnings
is for promises that do not return errors/warnings. Should never happen.
  
## **UPDATED INSTALLATION/EXECUTION NOTES**
  
It is far easier to install the required packages globally. To do so, use the following commands:
  npm install -g ws
  npm install -g fs
  npm install -g cross-fetch
  npm install -g discord.io
  npm install -g moment
  npm install -g http
  npm install -g url
  
You can then use 'npm list -g' to see all your packages, as well as where they are installed.
To run, I have created a go.js file (I have one for all my Node.js scripts, so one command, when
run from any directory, will execute the proper script). Type "node go" to run.
  
If there are any missing packages, you will get an error on the console. Just install using npm as above.
I run on a Mac or Linux, so I have pointed node to use the global package repo by default, on Windows, not 
sure offhand how to do so - if you have a prob, I'm sure I can figure it out. There's an environment variable
you can set to point to it. I think the env. var name is NODE_PATH.
  
On Linux, I do this to set up the env. var:
  
// Find path. Any package you have can be substituted for 'cross-fetch', use 'node list -g' to find one.
echo 'console.log(process.env.NODE_PATH); require("cross-fetch")' | NODE_PATH="$(npm root -g):$NODE_PATH" node 

// Set permanently:
ln -vs "$(npm root -g)" "$HOME"/.node_modules

// Test
echo 'require("cross-fetch")' | node

  
Note that discord.io has some bugs in it. Some of them are fixed in the discord.io/lib directory (index.js), copy this file over as well
after installing discord.io via npm. The fix is in the Git commit comments - if discord.io has a new version release, the fix will need 
to be migrated.
  
To terminate, Ctrl-C will initiate gracefull shutdown, as will '@terminate' from chat (with dev/committee permissions) or 
from curl. '@abort' forces a kill signal, and @restart will terminate and restart. @reload will reload the config file,
using any change that may have been made, without restarting. Curl also has it's own commands to exit:
 
curl "http://localhost:8001/facchat/?cmd=quit"<br>
curl "http://localhost:8001/facchat/?cmd=exit"<br>
  
  

