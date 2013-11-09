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
			log.debug('Client connected to server');
			callback(null);
		});
		connection.on('end', function()
		{
			log.debug('Client disconnected from server');
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
	 * Set a value.
	 */
	self.set = function(key, exptime, value, callback)
	{
		pending = getSetter(callback);
		var message = value;
		if (typeof value != 'string')
		{
			message = JSON.stringify(value);
		}
		connection.write('set ' + key + ' 0 ' + exptime + ' ' + message.length + '\r\n');
		connection.write(message + '\r\n');
	};

	/**
	 * Get a function to receive the output of a set.
	 */
	function getSetter(callback)
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
		log.debug('Stopping the client');
		pending = callback;
		connection.end();
	};
};

/**
 * Test get, set and delete.
 */
function testGetSetDelete(callback)
{
	var options = {
		port: 11215,
	};
	var value = {
		a: 'b',
	};
	var client = new exports.Client(options, function(error)
	{
		testing.check(error, 'Could not create client', callback);
		client.set('test', 0, value, function(error, result)
		{
			testing.check(error, 'Could not set value', callback);
			log.info('set result: %s', result);
			client.get('test', function(error, result)
			{
				testing.check(error, 'Could not get value', callback);
				log.info('get result: %s', result);
				client.stop(callback);
			});
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
		getSetDelete: testGetSetDelete,
	}, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

