'use strict';

/**
 * nodecached server: main.
 * (C) 2013 Alex Fernández.
 */


// requires
var Log = require('log');
var net = require('net');
var Parser = require('./parser.js').Parser;
var testing = require('testing');

// constants
var DEFAULT_PORT = 11211;

// globals
var log = new Log('info');


/**
 * Start the server. Options:
 *	- port: to listen on.
 *	- error: return 'ERROR' on every query.
 *	- notice: show notice messages.
 *	- info: show info messages.
 *	- debug: show debug messages.
 */
exports.start = function(options, callback)
{
	var port = options.port || DEFAULT_PORT;
	var server = net.createServer(getConnectionOpener(options));
	server.listen(port, function()
	{
		log.notice('Started server on port %s', port);
		if (callback)
		{
			callback(null, server);
		}
	});
	return server;
};

/**
 * Get a function to open a new connection.
 */
function getConnectionOpener(options)
{
	return function(connection)
	{
		var parser = new Parser();
		log.info('Client connected to server');
		if (!options.delay)
		{
			connection.setNoDelay();
		}
		connection.on('end', function()
		{
			log.info('Client disconnected from server');
		});
		connection.on('error', function(error)
		{
			log.error('Connection error: %s', error);
			connection.close();
		});
		connection.on('data', function(data)
		{
			if (options.error)
			{
				return connection.write('ERROR\r\n');
			}
			var message = String(data);
			var line = message.substringUpTo('\r\n');
			var rest = message.substringFrom('\r\n');
			var result = parser.readLine(line);
			if (rest)
			{
				if (result)
				{
					log.error('Unexpected result %s, ignoring', result);
				}
				result = parser.readLine(rest);
			}
			if (result)
			{
				connection.write(result + '\r\n');
			}
		});
	};
}

/**
 * Stop the server.
 */
exports.stop = function(server, callback)
{
	server.close(callback);
};

/**
 * Test that the server starts and stops.
 */
function testStart(callback)
{
	var options = {
		port: 11234,
	};
	exports.start(options, function(error, server)
	{
		testing.check(error, 'Could not start server');
		exports.stop(server, callback);
	});
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	log.debug('Running tests');
	testing.run({
		start: testStart,
	}, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	if (process.argv.length == 3)
	{
		return exports.start({
			port: parseInt(process.argv[2], 10),
		});
	}
	exports.test(testing.show);
}

