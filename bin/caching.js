#!/usr/bin/env node
'use strict';

/**
 * Binary to run a caching server.
 * (C) 2013 Alex Fernández.
 */

// requires
var args = require('optimist').argv;
var server = require('../lib/server');

// constants
var optionMap = {
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
for (var shortOption in optionMap)
{
	var longOption = optionMap[shortOption];
	args[longOption] = args[shortOption];
}
server.startServer(args);

/**
 * Show online help.
 */
function help()
{
	console.log('Usage: caching [options]');
	console.log('  starts a caching server.');
	console.log('Options:');
	console.log('    --p [port]      Port to run the server, default 11211');
	console.log('    --v             Show notice messages');
	console.log('    --vv            Show info messages');
	console.log('    --vvv           Show debug messages');
	process.exit(1);
}

