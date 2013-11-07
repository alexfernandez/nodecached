'use strict';

/**
 * Caching server.
 * (C) 2013 Alex Fernández.
 */


// requires
var Log = require('log');
var net = require('net');
var testing = require('testing');

// constants
var DEFAULT_PORT = 11211;

// globals
var log = new Log('info');


/**
 * Start the server.
 */
exports.start = function(options, callback)
{
	var port = options.port || DEFAULT_PORT;
	var server = net.createServer(function(connection)
	{
		// 'connection' listener
		log.info('Client connected to server');
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
			log.info('Received data %s', data);
		});
	});
	server.listen(options.port || DEFAULT_PORT, function()
	{
		log.info('Started server on port %s', port);
		if (callback)
		{
			callback(null, server);
		}
	});
	return server;
};

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

