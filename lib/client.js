'use strict';

/**
 * nodecached client.
 * (C) 2013 Alex Fernández.
 */


// requires
require('prototypes');
var token = require('./token.js');
var server = require('./server.js');
var Log = require('log');
var net = require('net');
var Memcached = require('memcached');
var testing = require('testing');

// constants
var TIMEOUT = 5000;

// globals
var log = new Log('notice');
var memcached;


/**
 * A client object.
 */
exports.Client = function(options, callback)
{
	// self-reference
	var self = this;

	// attributes
	var connection;
	var pending = callback;
	var log = new Log('notice');

	// init
	init();

	/**
	 * Init the connection.
	 */
	function init()
	{
		if (options.info)
		{
			log = new Log('info');
		}
		if (options.debug)
		{
			log = new Log('debug');
		}
		connection = net.connect(options);
		connection.setTimeout(TIMEOUT);
		if (!options.delay)
		{
			connection.setNoDelay();
		}
		connection.on('connect', function()
		{
			log.info('Client connected to server');
			if (pending)
			{
				pending(null);
			}
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
			if (pending)
			{
				pending(error);
			}
			connection.destroy();
		});
		connection.on('data', function(data)
		{
			if (options.noResponse)
			{
				return pending(null);
			}
			log.debug('Received %s', data);
			if (!pending)
			{
				log.error('Unexpected data %s', data);
				return;
			}
			var message = String(data);
			if (message.length === 0)
			{
				return;
			}
			pending(null, message);
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
	 * Write a message through the connection.
	 */
	function write(message)
	{
		log.debug('Writing %s', message);
		connection.write(message);
	}

	/**
	 * Get a value.
	 */
	self.get = function(key, callback)
	{
		pending = getGetter(callback);
		write('get ' + key + '\r\n');
	};

	/**
	 * Get a function to receive the output of a get.
	 */
	function getGetter(callback)
	{
		return getPending(callback, function(message)
		{
			var parsed = parseGet(message);
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
	function parseGet(message)
	{
		var lines = message.split('\r\n');
		var line = lines.shift();
		if (line == 'END')
		{
			return null;
		}
		var words = line.split(' ');
		var word = words.shift();
		if (word == 'ERROR')
		{
			return null;
		}
		if (word != 'VALUE')
		{
			log.error('Unknown token %s in %s', word, lines);
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
	self.set = function(key, value, exptime, callback)
	{
		pending = getSetter(callback);
		var message = value;
		if (typeof value != 'string')
		{
			message = JSON.stringify(value);
		}
		write('set ' + key + ' 0 ' + exptime + ' ' + message.length + '\r\n');
		write(message + '\r\n');
	};

	/**
	 * Get a function to receive the output of a set.
	 */
	function getSetter(callback)
	{
		callback = callback || function () {};
		return getPending(callback, function(message)
		{
			var result = message.trim();
			if (result == 'ERROR')
			{
				callback(null, false);
			}
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
		write('delete ' + key + '\r\n');
	};

	/**
	 * Get a function to receive the output of a delete.
	 */
	function getDeleter(callback)
	{
		return getPending(callback, function(message)
		{
			var result = message.trim();
			if (result == 'DELETED')
			{
				return callback(null, true);
			}
			if (result == 'NOT_FOUND')
			{
				return callback(null, false);
			}
			if (result == 'ERROR')
			{
				callback(null, false);
			}
			log.error('Delete result: %s', result);
			callback(null, false);
		});
	}

	/**
	 * Get a pending function with a callback and a handler for the message.
	 */
	function getPending(callback, handler)
	{
		if (options.noResponse)
		{
			return callback;
		}
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
		port: 11235,
	};
	var key = 'test' + token.create();
	var value = {
		a: 'b',
	};
	server.start(options, function(error, nodecached)
	{
		testing.check(error, 'Could not start server', callback);
		var client = new exports.Client(options, function(error)
		{
			testing.check(error, 'Could not create client', callback);
			client.set(key, value, 10, function(error, result)
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
							client.stop(function(error)
							{
								testing.check(error, 'Could not stop client', callback);
								server.stop(nodecached, callback);
							});
						});
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
		port: 11236,
	};
	var key = 'test' + token.create();
	server.start(options, function(error, nodecached)
	{
		testing.check(error, 'Could not start server', callback);
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
					client.stop(function(error)
					{
						testing.check(error, 'Could not stop client', callback);
						server.stop(nodecached, callback);
					});
				});
			});
		});
	});
}

/**
 * A client that uses the memcached driver.
 */
exports.MemcachedClient = function(options, callback)
{
	// self-reference
	var self = this;

	// init
	if (!memcached)
	{
		memcached = new Memcached('localhost:' + options.port);
	}
	process.nextTick(callback);

	/**
	 * Get a value.
	 */
	self.get = function(key, callback)
	{
		memcached.get(key, callback);
	};

	/**
	 * Set a value.
	 */
	self.set = function(key, value, exptime, callback)
	{
		memcached.set(key, value, exptime, callback);
	};

	/**
	 * Delete a value.
	 */
	self.delete = function(key, callback)
	{
		memcached.delete(key, callback);
	};

	/**
	 * Stop the client.
	 */
	self.stop = function(callback)
	{
		log.debug('Stopping the client');
		memcached.end();
		if (callback)
		{
			process.nextTick(callback);
		}
	};
};

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

