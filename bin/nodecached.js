#!/usr/bin/env node
'use strict';

/**
 * Binary to run a nodecached server.
 * (C) 2013 Alex Fernández.
 */

// requires
const args = require('optimist').argv;
const server = require('../lib/server');

// constants
const optionMap = {
	p: 'port',
	v: 'notice',
	vv: 'info',
	vvv: 'debug',
};

// init
if(args.help || args.h)
{
	help();
}
if(args._.length > 0)
{
	console.log('Too many arguments: %s', args._[0]);
	help();
}
for (const shortOption in optionMap)
{
	const longOption = optionMap[shortOption];
	if (args[shortOption])
	{
		args[longOption] = args[shortOption];
	}
}
server.start(args);

/**
 * Show online help.
 */
function help()
{
	console.log('Usage: nodecached [options]');
	console.log('  starts a nodecached server.');
	console.log('Options:');
	console.log('    -p [port]      Port to run the server, default 11211');
	console.log('    -v             Show notice messages');
	console.log('    -vv            Show info messages');
	console.log('    -vvv           Show debug messages');
	console.log('    --fast         Return an error every time (for testing)');
	process.exit(1);
}

