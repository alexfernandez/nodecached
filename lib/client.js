'use strict';

/**
 * nodecached client.
 * (C) 2013 Alex Fernández.
 */


// requires
var Log = require('log');
var net = require('net');
var testing = require('testing');

// constants
var DEFAULT_PORT = 11211;
var TIMEOUT = 5000;

// globals
var log = new Log('info');


/**
 * A client object.
 */
exports.Client = function(options, callback)
{
	// self-reference
	var self = this;

	// attributes
	var connection;
	var pending = null;

	// init
	init();

	/**
	 * Init the connection.
	 */
	function init()
	{
		options.port = options.port || DEFAULT_PORT;
		connection = net.connect(options);
		connection.setTimeout(TIMEOUT);
		connection.on('connect', function()
		{
			log.info('Client connected to server');
			callback(null);
		});
		connection.on('end', function()
		{
			log.info('Client disconnected from server');
			if (pending)
			{
				pending(null);
			}
		});
		connection.on('error', function(error)
		{
			log.error('Connection error: %s', error);
			if (callback)
			{
				callback(error);
			}
			connection.destroy();
		});
		connection.on('data', function(data)
		{
			if (!pending)
			{
				log.error('Unexpected data %s', data);
				return;
			}
			pending(data);
		});
		connection.on('timeout', function()
		{
			if (pending)
			{
				pending('timeout');
			}
		});
	}

	/**
	 * Get a value.
	 */
	self.get = function(key, callback)
	{
		pending = getGetter(callback);
		connection.write('get ' + key + '\r\n');
	};

	/**
	 * Get a function to receive the output of a get.
	 */
	function getGetter(callback)
	{
		return function(data)
		{
			callback(null, data);
		};
	}

	/**
	 * Stop the client.
	 */
	self.stop = function(callback)
	{
		pending = callback;
		connection.destroy();
	};
};

/**
 * Test that the server starts and stops.
 */
function testStart(callback)
{
	var options = {
		port: 11215,
	};
	var client = new exports.Client(options, function(error)
	{
		testing.check(error, 'Could not create client', callback);
		client.get('test', function(error, result)
		{
			testing.check(error, 'Could not get value', callback);
			log.info('Result: %s', result);
			client.stop(callback);
		});
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

