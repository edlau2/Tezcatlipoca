const cp = require('child_process');

const scriptName = 'parse-attack-log.js';

const child = cp.fork(scriptName);
console.log('Child process: ', child);
console.log('ProcessID: ' + child.pid);
console.log('\n\n***** Waiting on child process termination *****\n\n');



