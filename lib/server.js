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
var ERROR_BUFFER = new Buffer('ERROR\r\n');

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
 *	- fast: return 'ERROR' on every query.
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
	var server = null;

	// init
	init();

	/**
	 * Init server.
	 */
	function init()
	{
		options.port = options.port || DEFAULT_PORT;
		for (var i in LOG_LEVELS)
		{
			var level = LOG_LEVELS[i];
			if (options[level])
			{
				log = new Log(level);
			}
		}
		server = net.createServer(function(socket)
		{
			new Connection(options, log).init(socket);
		});
		server.on('error', function(error)
		{
			var message = 'Could not start server on port ' + options.port + ': ' + error;
			if (callback)
			{
				return callback(message);
			}
			log.error(message);
		});
		server.listen(options.port, function()
		{
			if (callback)
			{
				return callback(null, self);
			}
			log.notice('Started server on port %s', options.port);
		});
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
 * A connection to the server.
 */
var Connection = function(options, log)
{
	// self-reference
	var self = this;

	// attributes
	var parser = new Parser(options);

	/**
	 * Init the connection with a socket.
	 */
	self.init = function(socket)
	{
		self.socket = socket;
		log.info('Client connected to server');
		if (!options.delay)
		{
			socket.setNoDelay();
		}
		socket.on('end', function()
		{
			log.info('Client disconnected from server');
		});
		socket.on('error', function(error)
		{
			log.info('Socket error: %s', error);
			socket.end();
		});
		socket.on('data', readData);
	};

	/**
	 * Read data from a connection.
	 */
	function readData(data)
	{
		if (data[0] == 4)
		{
			// EOT (control-D)
			return self.socket.end();
		}
		if (options.fast)
		{
			return self.socket.write(ERROR_BUFFER);
		}
		// var message = data.toString();
		// var line = message.substringUpTo('\r\n');
		// var rest = message.substringFrom('\r\n');
		var rn = 0;
		for (var i = 0; i < data.length; i++)
		{
			if (data[i] == 13 && data[i + 1] == 10)
			{
				rn = i;
				break;
			}
		}
		var line, rest;
		if (rn)
		{
			line = data.toString('utf8', 0, rn);
			rest = data.toString('utf8', rn + 2);
		}
		else
		{
			line = data.toString('utf8');
		}
		var result = parser.readLine(line);
		if (rest)
		{
			if (result)
			{
				log.error('Unexpected result %s, ignoring', result);
			}
			result = parser.readLine(rest);
		}
		if (result == 'quit')
		{
			log.info('Quitting');
			return self.socket.end();
		}
		if (result)
		{
			self.socket.write(result + '\r\n');
		}
	}
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
	testing.run([testStart], callback);
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

