/********************************************************************************
 *  
 * File: config.js
 * 
 * JS configuration file for facchat.js
 * 
 * Discord dev page: https://discord.com/developers/applications/me
 *
 * Login: https://discordapp.com/oauth2/authorize?&client_id=CLIENTID&scope=bot&permissions=<perms>
 * https://discord.com/oauth2/authorize?client_id=918266932589912114&scope=bot&permissions=2147928064
 * 
 *******************************************************************************/

var config = {};
config.web = {};
config.api = {};
config.filter = {};
config.discord = {};

// Enable for special debug support. Enables 'console.debug(...)'.
config.logToFile = true; // true to echo console logging to logfile
config.logfilemode = 'w'; // 'a' to append
config.debug = true;
config.sandbox = false; // true to use sandbox channel webhook, false to use private fac chat channel.

// 'secret' issued by Torn. Seems to only change if you explicitly log out.
config.web.secret = "Your Secret Here"; // $('script[secret]').attr("secret");
config.web.uid = 'Your User ID Here'; // $('script[uid]').attr("uid"); // My Torn user ID, [2100735]
config.web.apikey = 'Your Limited API Key Here'; // Torn API key
config.web.chatURL = 'wss://ws-chat.torn.com/chat/ws';
config.web.origin = 'https://www.torn.com';
config.web.roomId = 'Faction:8151';
config.web.attemptRecovery = true;
config.web.maxRecoveries = 25; // Max attempts to recover. '-1' == no max, try indefinitely.

// Web server for debug/dev/maintainance w/o chat interaction
config.web.listen = false;         // TRUE to listen on the below addr:port for commands via HTTP
config.web.host = 'localhost';     // Use IPADDR_ANY for any address
config.web.port = process.env.WEB_PORT || 8001;

// Discord bot related tokens and such. Client/App ID are synonymous.
// The token is needed for authentication.
config.discord.listen = true; // TRUE to enable the bot, to listen for commands via Discord
config.discord.botname = 'Ath3na';
config.discord.botToken = 'Your Bot Token Here'; // Ask xedx !!!!

config.discord.purgeCheckIntHrs = 2; // hour interval to check for messages older than 2 (minimum) days. 0 = never purge
config.discord.purgeMaxDays = 3; // Days to keep messages, minimum must be >=2 ATM (?). Not really tested, I'd advise leaving alone!

// Channel ID's
config.discord.sandboxID = '888867831725318176';
config.discord.facchatID = '909954037913366528';

// User ID's (for mentions) and roles (for authentication)
config.discord.bankerID = '<@&657448512308510740>';
config.discord.roles = {
	Ath3na: '918312492046897203',
	Committee: '758092682454368318',
	Bots: '653105688033361950',
	Tech: '867347692036161537',
	Leadership: '806334879502434366',
	Superman: '410853896798601216',
	London: '411591545972850745'
};

// Webhooks and avatar stuff
config.discord.webhook = 'https://discord.com/api/webhooks/909954192385388554/HJ03c3mWAulmUIoUZve7zFewrMaVp32pg0WvmdhKjEiPexRPfQEzPgHJAocHOh7B07mq';
config.discord.sandbox_webhook = 'https://discord.com/api/webhooks/889861324601958412/AC_N_wlhYRc9_Pb-VHno9sQVq1m5Ig8Tw3hkOKVQCWoIuh7PMB1_OaHxCGvm8pfAFHV4';
config.discord.banker_webhook = 'https://discord.com/api/webhooks/912466966969737257/h8NtGxYi7xNZP7YXB13MJYwk5wBvJzdpHExUtXYVFMkW-AL4EwCCIbaxi0kHE0b52L9K';
config.discord.archive_webhook = 'https://discord.com/api/webhooks/923064115910570014/OR_shr0jIxz8Zud0sGGqCLLQ43c8lng7DSRng1ww2wUMjXb5LAi4Ld0FNnGJYB3ejq9m';

config.discord.appUserName = 'Athena';
config.discord.appUserAvatar = 'https://avatarfiles.alphacoders.com/160/160308.jpg';
config.discord.appUserThumbnail = "https://imgur.com/5O74TMd.png";

config.api.appMsg = {'senderName': config.discord.appUserName, 'senderId': '', 'sequenceNumber': 0, 'messageId': 0, 'state': 'dequeued', 'messageText': ''};
config.api.chatMsg = {'senderName': config.discord.appUserName, 'senderId': '', 'sequenceNumber': 0, 'messageId': 0, 'roomId': config.web.roomId, 'messageText': ''};
config.api.devMsg = {'senderName': 'developer', 'senderId': 'dev', 'sequenceNumber': 0, 'messageId': 0, 'state': 'dequeued', 'type': 'dev', 'messageText': ''};

config.api.archive = true;			   // TRUE to archive Discord messages to alt channel
config.api.allowBanker = true;		   // TRUE to allow Banker notifications.	
config.api.msgQueueDelay = 2000;	   // Delay to hold messages for before sending, ms
config.api.savedMsgsmax = 1000;		   // Length of array holding sent msg IDs, to check for duplicates
config.api.silentSuppressDups = true;  // TRUE to silently suppress messages, if duplicated. Prevents logging to console.
config.api.datafile = 'facchat.dat';   // File above array is saved in
config.api.trackRate = false;	       // TRUE to track the rate headers and respond appropriately. (TBD)
config.api.silentRestarts = false;     // TRUE to suppress the friendly 'Down for maintainance' and 'Back up!' messages.
config.api.pingPongInterval = 60000;   // ms betweening sending pings.
config.api.silentPing = true;          // TRUE to suppress debug messages for ping/pong to console
config.api.silentResponse = false;     // TRUE to suppress response logging to console
config.api.bankerQueueMin = 10;        // Time between when Athena will post banker requests from one user ID to Discord (minutes).

// Whether or not to allow chat messages to be interpreted by Athena
// Required to allow commands from chat as well as Discord.
// config.discord.listen controls whether or not Discord listens as well,
// in order to interpret commands typed there.
config.filter.allowInternalInteraction = true;

module.exports = config;
