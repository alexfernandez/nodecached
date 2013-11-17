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
var LOG_LEVELS = ['notice', 'info', 'debug'];

// globals
var log = new Log('info');


/**
 * Start a server. Options are the same as for Server.
 */
exports.start = function(options, callback)
{
	return new exports.Server(options, callback);
};

/**
 * Stop a server.
 */
exports.stop = function(server, callback)
{
	server.end(callback);
};

/**
 * A nodecached server. Options:
 *	- port: to listen on.
 *	- error: return 'ERROR' on every query.
 *	- notice: show notice messages.
 *	- info: show info messages.
 *	- debug: show debug messages.
 * An optional callback will be called after the server has started.
 */
exports.Server = function(options, callback)
{
	// self-reference
	var self = this;

	// attributes
	var log = new Log('warning');
	var port = options.port || DEFAULT_PORT;
	var server = null;

	// init
	init();

	/**
	 * Init server.
	 */
	function init()
	{
		for (var i in LOG_LEVELS)
		{
			var level = LOG_LEVELS[i];
			if (options[level])
			{
				log = new Log(level);
			}
		}
		server = net.createServer(getConnectionOpener(options));
		server.on('error', function(error)
		{
			var message = 'Could not start server on port ' + port + ': ' + error;
			if (callback)
			{
				return callback(message);
			}
			log.error(message);
		});
		server.listen(port, function()
		{
			if (callback)
			{
				return callback(null, self);
			}
			log.notice('Started server on port %s', port);
		});
	}

	/**
	 * Get a function to open a new connection.
	 */
	function getConnectionOpener(options)
	{
		return function(connection)
		{
			var parser = new Parser(options);
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
	 * End the server.
	 */
	self.end = function(callback)
	{
		server.close(callback);
	};
};

/**
 * Test that the server starts and stops.
 */
function testStart(callback)
{
	var options = {
		port: 11234,
	};
	var server = exports.start(options, function(error)
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
		return new exports.Server({
			port: parseInt(process.argv[2], 10),
		});
	}
	exports.test(testing.show);
}

