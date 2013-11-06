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
	var server = net.createServer(function(connection)
	{
		// 'connection' listener
		log.info('server connected');
		connection.on('end', function()
		{
			log.info('server disconnected');
		});
		connection.on('error', function(error)
		{
			log.error('Connection error: %s', error);
			connection.close();
		});
		connection.on('data', function(data)
		{
			log.info('Received %s', data);
		});
	});
	server.listen(options.port || DEFAULT_PORT, function()
	{
		//'listening' listener
		log.info('server bound');
		callback(null, server);
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
	exports.test(testing.show);
}


