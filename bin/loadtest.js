#!/usr/bin/env node
'use strict';

/**
 * Binary to load-test a memcached (possibly nodecached) server.
 * (C) 2013 Alex Fernández.
 */

// requires
var args = require('optimist').argv;
var loadtest = require('../lib/loadtest.js');

// constants
var optionMap = {
	c: 'concurrency',
	n: 'maxRequests',
	t: 'maxSeconds',
	v: 'info',
	vv: 'debug',
	noreply: 'noResponse',
};

// init
if(args.help || args.h)
{
	help();
}
if(args._.length > 2)
{
	console.log('Too many arguments: %s', args._.length);
	help();
}
while(args._.length > 0)
{
	var arg = args._.shift();
	if (parseInt(arg, 10))
	{
		args.port = parseInt(arg, 10);
	}
	else
	{
		args.host = parseInt(arg, 10);
	}
}
for (var shortOption in optionMap)
{
	var longOption = optionMap[shortOption];
	args[longOption] = args[shortOption];
}
loadtest.run(args);

/**
 * Show online help.
 */
function help()
{
	console.log('Usage: loadtest-nodecached [options] [localhost] [port]');
	console.log('  loadtests a memcached server.');
	console.log('Options:');
	console.log('    -n [requests]     Max number of request');
	console.log('    -c [concurrency]  Number of simultaneous requests');
	console.log('    -t [seconds]      Max number of seconds');
	console.log('    --key [key]       The key to use for tests');
	console.log('    --memcached       Use the node-memcached client');
	console.log('    --noreply         Ignore any server reply');
	console.log('    -v                Show info messages');
	console.log('    -vv               Show debug messages');
	process.exit(1);
}

