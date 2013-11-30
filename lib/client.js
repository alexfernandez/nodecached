'use strict';
/* jshint camelcase: false */

/**
 * nodecached client.
 * (C) 2013 Alex Fernández.
 */


// requires
require('prototypes');
var token = require('./token.js');
var server = require('./server.js');
var packageJson = require('../package.json');
var Log = require('log');
var net = require('net');
var async = require('async');
var testing = require('testing');

// constants
var TIMEOUT = 5000;
var OPS = {
	get: true,
	set: true,
	add: true,
	replace: true,
	delete: true,
	incr: true,
	decr: true,
	touch: true,
	stats: true,
};

// globals
var log = new Log('notice');


/**
 * A client object. Params:
 *	- locations: a string, array or object that specifies where to connect.
 *	A string should be in the simple form `hostname:port`.
 *	When several servers are used the client will send queries to just one
 *	server at random.
 *	When an object is used, the keys are server locations and the values
 *	are weights, ignored by now.
 *	- Options is an optional object which may have:
 *		- timeout: time to wait for an operation.
 *		- delay: to enable Nagle's algorithm.
 *	- Callback: function(error, result) to be called when the last server
 *	is connected.
 */
exports.Client = function(locations, options, callback)
{
	// self-reference
	var self = this;

	// attributes
	var connections = {};
	var log = new Log('notice');

	// init
	init();

	/**
	 * Init attributes and connections.
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
		options.log = log;
		for (var operation in OPS)
		{
			self[operation] = getDistributor(operation);
		}
		initConnections();
	}

	/**
	 * Returns a function to distribute an operation to a connection.
	 */
	function getDistributor(name)
	{
		return function()
		{
			var connection = pickRandomConnection();
			var fn = connection[name];
			if (!fn)
			{
				log.error('Connection missing the %s function', name);
				return;
			}
			fn.apply(connection, arguments);
		};
	}

	/**
	 * Pick a random connection from the lot.
	 */
	function pickRandomConnection()
	{
		var totalWeight = 0;
		for (var location in connections)
		{
			totalWeight += connections[location].weight;
		}
		var targetWeight = Math.random() * totalWeight;
		for (location in connections)
		{
			targetWeight -= connections[location].weight;
			if (targetWeight <= 0)
			{
				return connections[location];
			}
		}
		log.error('Could not pick winning connection');
		return null;
	}

	/**
	 * Init all connections.
	 */
	function initConnections()
	{
		var tasks = {};
		if (typeof locations == 'string')
		{
			tasks[locations] = getConnectionCreator(locations);
		}
		else if (Array.isArray(locations))
		{
			locations.forEach(function(location)
			{
				tasks[location] = getConnectionCreator(location);
			});
		}
		else if (typeof locations == 'object')
		{
			for (var key in locations)
			{
				tasks[key] = getConnectionCreator(key);
			}
		}
		else
		{
			log.error('Invalid location %s: must be string, array of strings or object', locations);
			return;
		}
		async.parallel(tasks, function(error, result)
		{
			if (error)
			{
				log.error('Could not create connections: %s', error);
				return callback(error);
			}
			var weight = 1 / result.countProperties();
			for (var location in result)
			{
				var connection = result[location];
				if (connection)
				{
					connection.weight = weight;
				}
				connections[location] = connection;
			}
			callback(null);
		});
	}

	/**
	 * Get a function to create a connection.
	 */
	function getConnectionCreator(location)
	{
		return function(callback)
		{
			var connection = new ServerConnection(location, options, function(error)
			{
				if (error)
				{
					log.error('Could not initialize server on %s', location);
					return callback(null);
				}
				callback(null, connection);
			});
		};
	}

	/**
	 * End the client.
	 */
	self.end = function(callback)
	{
		log.debug('Ending the client: %j', connections);
		var tasks = {};
		for (var location in connections)
		{
			tasks[location] = getCloser(connections[location]);
		}
		async.parallel(tasks, callback);
	};

	/**
	 * A function to close a connection,
	 * not a romantic statement of any kind.
	 */
	function getCloser(connection)
	{
		return function(callback)
		{
			connection.end(callback);
		};
	}
};

/**
 * A connection to a server.
 */
var ServerConnection = function(location, options, callback)
{
	// self-reference
	var self = this;

	// attributes
	var connection = null;
	var pending = callback;
	var log = options.log;
	self.weight = 0;
	// init
	init();

	/**
	 * Init the connection.
	 */
	function init()
	{
		if (!location.contains(':'))
		{
			log.error('Invalid location %s', location);
			return;
		}
		var params = {
			host: location.substringUpTo(':'),
			port: parseInt(location.substringFrom(':'), 10),
		};
		if (!params.port)
		{
			log.error('Invalid non-numeric or zero port in location %s', location);
			return;
		}
		connection = net.connect(params);
		connection.setTimeout(options.timeout || TIMEOUT);
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
		set(key, value, exptime, 'set', callback);
	};

	/**
	 * Add a value only if not present.
	 */
	self.add = function(key, value, exptime, callback)
	{
		set(key, value, exptime, 'add', callback);
	};

	/**
	 * Replace a value only if already present.
	 */
	self.replace = function(key, value, exptime, callback)
	{
		set(key, value, exptime, 'replace', callback);
	};

	function set(key, value, exptime, command, callback)
	{
		pending = getSetter(callback);
		var message = value;
		if (typeof value != 'string')
		{
			message = JSON.stringify(value);
		}
		write(command + ' ' + key + ' 0 ' + exptime + ' ' + message.length + '\r\n');
		write(message + '\r\n');
	}

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
			if (result == 'NOT_STORED')
			{
				return callback(null, false);
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
	 * Increment a value.
	 */
	self.incr = function(key, value, callback)
	{
		pending = getIncrementer(callback);
		write('incr ' + key + ' ' + value + '\r\n');
	};

	/**
	 * Decrement a value.
	 */
	self.decr = function(key, value, callback)
	{
		pending = getIncrementer(callback);
		write('decr ' + key + ' ' + value + '\r\n');
	};

	/**
	 * Get a function to receive the output of an incr.
	 */
	function getIncrementer(callback)
	{
		return getPending(callback, function(message)
		{
			var result = message.trim();
			if (result == 'NOT_FOUND')
			{
				return callback(null, false);
			}
			callback(null, result);
		});
	}

	/**
	 * Touch a value.
	 */
	self.touch = function(key, exptime, callback)
	{
		pending = getToucher(callback);
		write('touch ' + key + ' ' + exptime + '\r\n');
	};

	/**
	 * Get a function to receive the output of a touch.
	 */
	function getToucher(callback)
	{
		return getPending(callback, function(message)
		{
			var result = message.trim();
			if (result == 'NOT_FOUND')
			{
				return callback(null, false);
			}
			callback(null, true);
		});
	}

	/**
	 * Retrieve server stats.
	 */
	self.stats = function(callback)
	{
		pending = getStater(callback);
		write('stats' + '\r\n');
	};

	function getStater(callback)
	{
		return getPending(callback, function(message)
		{
			var stats = {};
			var lines = message.split('\r\n');
			lines.forEach(function(line)
			{
				var words = line.split(' ');
				if (words[0] == 'END')
				{
					return callback(null, stats);
				}
				else if (words[0] == 'STATS')
				{
					if (words.length != 3)
					{
						log.error('Invalid line %s', line);
						return;
					}
					stats[words[1]] = words[2];
				}
				else if (words[0])
				{
					log.error('Unknown stats command %s', line);
				}
			});
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
			if (result.startsWith('CLIENT_ERROR '))
			{
				return callback(result);
			}
			return handler(result);
		};
	}

	/**
	 * End the connection.
	 */
	self.end = function(callback)
	{
		log.debug('Ending the connection to %s', location);
		pending = callback;
		connection.end();
	};
};

/**
 * Test get, set and delete.
 */
function testGetSetDelete(callback)
{
	var key = 'test#' + token.create();
	var value = {
		a: 'b',
	};
	runTest(11235, function(client, rest)
	{
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
						rest();
					});
				});
			});
		});
	}, callback);
}

/**
 * Test what happens with values not found.
 */
function testNotFound(callback)
{
	var key = 'test#' + token.create();
	runTest(11237, function(client, rest)
	{
		client.get(key, function(error, result)
		{
			testing.check(error, 'Could not get value', callback);
			testing.assertEquals(result, null, 'Invalid empty get result', callback);
			client.delete(key, function(error, result)
			{
				testing.check(error, 'Could not delete value', callback);
				testing.assertEquals(result, false, 'Invalid empty delete result', callback);
				rest();
			});
		});
	}, callback);
}

/**
 * Test incr and decr.
 */
function testIncrDecr(callback)
{
	var key = 'test#' + token.create();
	runTest(11237, function(client, rest)
	{
		client.set(key, 10, 10, function(error, result)
		{
			testing.check(error, 'Could not set value', callback);
			testing.assertEquals(result, true, 'Invalid set result', callback);
			client.incr(key, 5, function(error, result)
			{
				testing.check(error, 'Could not incr value', callback);
				testing.assertEquals(result, 15, 'Invalid incr result', callback);
				client.decr(key, 20, function(error, result)
				{
					testing.check(error, 'Could not decr value', callback);
					testing.assertEquals(result, 0, 'Invalid decr result', callback);
					rest();
				});
			});
		});
	}, callback);
}

/**
 * Test invalid incr.
 */
function testInvalidIncr(callback)
{
	var key = 'test#' + token.create();
	runTest(11238, function(client, rest)
	{
		client.set(key, 'aa', 10, function(error, result)
		{
			testing.check(error, 'Could not set value', callback);
			testing.assertEquals(result, true, 'Invalid set result', callback);
			client.incr(key, 5, function(error)
			{
				testing.assert(error, 'Should not incr value', callback);
				rest();
			});
		});
	}, callback);
}

/**
 * Test touching a record.
 */
function testTouch(callback)
{
	var key = 'test#' + token.create();
	runTest(11239, function(client, rest)
	{
		client.touch(key, 15, function(error, result)
		{
			testing.check(error, 'Could not touch', callback);
			testing.assertEquals(result, false, 'Should not touch', callback);
			client.set(key, 'aa', 10, function(error, result)
			{
				testing.check(error, 'Could not set value', callback);
				testing.assertEquals(result, true, 'Invalid set result', callback);
				client.touch(key, 15, function(error, result)
				{
					testing.check(error, 'Could not set value', callback);
					testing.assertEquals(result, true, 'Should touch', callback);
					rest();
				});
			});
		});
	}, callback);
}

/**
 * Test stats.
 */
function testStats(callback)
{
	runTest(11240, function(client, rest)
	{
		client.stats(function(error, stats)
		{
			testing.check(error, 'Could not get stats', callback);
			testing.assert(stats.countProperties() > 5, 'Not enough stats', callback);
			var version = packageJson.name + '-' + packageJson.version;
			testing.assertEquals(stats.version, version, 'Invalid version', callback);
			testing.assertEquals(stats.total_items, 0, 'Invalid total items', callback);
			rest();
		});
	}, callback);
}

/**
 * Run a test against a local server. Params:
 *	- port: to open for the server.
 *	- test: function(client, rest) to call after the test has run.
 */
function runTest(port, test, callback)
{
	var options = {
		port: port,
	};
	var location = 'localhost:' + options.port;
	server.start(options, function(error, nodecached)
	{
		testing.check(error, 'Could not start server', callback);
		var client = new exports.Client(location, options, function(error)
		{
			testing.check(error, 'Could not create client', callback);
			test(client, function()
			{
				client.end(function(error)
				{
					testing.check(error, 'Could not stop client', callback);
					server.stop(nodecached, callback);
				});
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
	testing.run([
		testGetSetDelete,
		testNotFound,
		testIncrDecr,
		testInvalidIncr,
		testTouch,
		testStats,
	], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

