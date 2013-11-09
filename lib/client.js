'use strict';

/**
 * nodecached client.
 * (C) 2013 Alex Fernández.
 */


// requires
require('prototypes');
var token = require('./token.js');
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
			pending(null, data);
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
		return getPending(callback, function(data)
		{
			var parsed = parseGet(data);
			if (!parsed)
			{
				return callback(null, parsed);
			}
			if (parsed.startsWith('{') && parsed.endsWith('}'))
			{
				try
				{
					return callback(null, JSON.parse(parsed));
				}
				catch(exception)
				{
					log.error('Fake json in %s: %s', parsed, exception);
				}
			}
			callback(null, parsed);
		});
	}

	/**
	 * Parse the result of a get.
	 */
	function parseGet(data)
	{
		var lines = String(data).split('\r\n');
		var line = lines.shift();
		if (line == 'END')
		{
			return null;
		}
		var words = line.split(' ');
		var word = words.shift();
		if (word != 'VALUE')
		{
			log.error('Unknown token %s', word);
			return null;
		}
		word = words.shift();
		word = words.shift();
		word = words.shift();
		if (!word)
		{
			log.error('Invalid length %s', word);
			return null;
		}
		var length = parseInt(word, 10);
		line = lines.shift();
		if (line.length != length)
		{
			log.error('Unexpected line length not %s in %s', length, line);
			return null;
		}
		return line;
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
		return getPending(callback, function(data)
		{
			var result = String(data).trim();
			if (result == 'STORED')
			{
				return callback(null, true);
			}
			log.error('Set result: %s', result);
			callback(null, false);
		});
	}

	/**
	 * Delete a value.
	 */
	self.delete = function(key, callback)
	{
		pending = getDeleter(callback);
		connection.write('delete ' + key + '\r\n');
	};

	/**
	 * Get a function to receive the output of a delete.
	 */
	function getDeleter(callback)
	{
		return getPending(callback, function(data)
		{
			var result = String(data).trim();
			if (result == 'DELETED')
			{
				return callback(null, true);
			}
			if (result == 'NOT_FOUND')
			{
				return callback(null, false);
			}
			log.error('Delete result: %s', result);
			callback(null, false);
		});
	}

	/**
	 * Get a pending function with a callback and a handler for data.
	 */
	function getPending(callback, handler)
	{
		return function(error, result)
		{
			if (error)
			{
				return callback(error);
			}
			return handler(result);
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
	var key = 'test' + token.create();
	var value = {
		a: 'b',
	};
	var client = new exports.Client(options, function(error)
	{
		testing.check(error, 'Could not create client', callback);
		client.set(key, 10, value, function(error, result)
		{
			testing.check(error, 'Could not set value', callback);
			testing.assertEquals(result, true, 'Invalid set result', callback);
			client.get(key, function(error, result)
			{
				testing.check(error, 'Could not get value', callback);
				testing.assertEquals(result, value, 'Invalid get result', callback);
				client.delete(key, function(error, result)
				{
					testing.check(error, 'Could not delete value', callback);
					testing.assertEquals(result, true, 'Invalid delete result', callback);
					client.get(key, function(error, result)
					{
						testing.check(error, 'Could not get after delete', callback);
						testing.assertEquals(result, null, 'Invalid get deleted result', callback);
						client.stop(callback);
					});
				});
			});
		});
	});
}

/**
 * Test what happens with values not found.
 */
function testNotFound(callback)
{
	var options = {
		port: 11215,
	};
	var key = 'test' + token.create();
	var client = new exports.Client(options, function(error)
	{
		testing.check(error, 'Could not create client', callback);
		client.get(key, function(error, result)
		{
			testing.check(error, 'Could not get value', callback);
			testing.assertEquals(result, null, 'Invalid empty get result', callback);
			client.delete(key, function(error, result)
			{
				testing.check(error, 'Could not delete value', callback);
				testing.assertEquals(result, false, 'Invalid empty delete result', callback);
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
		notFound: testNotFound,
	}, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

