'use strict';

/**
 * nodecached server: main.
 * (C) 2013 Alex Fernández.
 */


// requires
const Log = require('log');
const net = require('net');
const Parser = require('./parser.js').Parser;
const testing = require('testing');

// constants
const DEFAULT_PORT = 11211;
const LOG_LEVELS = ['notice', 'info', 'debug'];
const ERROR_BUFFER = Buffer.from('ERROR\r\n');

// globals
let log = new Log('info');


/**
 * Start a server. Options are the same as for Server.
 */
function start(options, callback)
{
	return new Server(options, callback);
}

/**
 * Stop a server.
 */
function stop(server, callback)
{
	server.end(callback);
}

/**
 * A nodecached server. Options:
 *	- port: to listen on.
 *	- fast: return 'ERROR' on every query.
 *	- notice: show notice messages.
 *	- info: show info messages.
 *	- debug: show debug messages.
 * An optional callback will be called after the server has started.
 */
class Server
{
	constructor(options, callback) {
		this.options = options
		this.callback = callback
		this.log = new Log('warning');
		this.server = null;
		this.init();
	}

	/**
	 * Init server.
	 */
	init()
	{
		this.options.port = this.options.port || DEFAULT_PORT;
		for (const i in LOG_LEVELS)
		{
			const level = LOG_LEVELS[i];
			if (this.options[level])
			{
				log = new Log(level);
			}
		}
		this.server = net.createServer(socket => {
			new Connection(this.options, log).init(socket);
		});
		this.server.on('error', error => {
			const message = 'Could not start server on port ' + this.options.port + ': ' + error;
			if (this.callback)
			{
				return this.callback(message);
			}
			log.error(message);
		});
		this.server.listen(this.options.port, () => {
			if (this.callback)
			{
				return this.callback(null, this);
			}
			log.notice('Started server on port %s', this.options.port);
		});
	}

	/**
	 * End the server.
	 */
	end(callback)
	{
		this.server.close(callback);
	}
}

/**
 * A connection to the server.
 */
class Connection
{
	constructor(options, log) {
		this.options = options
		this.log = log
		this.parser = new Parser(options);
	}

	init(socket)
	{
		this.socket = socket;
		log.info('Client connected to server');
		if (!this.options.delay)
		{
			socket.setNoDelay();
		}
		socket.on('end', () => {
			log.info('Client disconnected from server');
		});
		socket.on('error', error => {
			log.info('Socket error: %s', error);
			socket.end();
		});
		socket.on('data', data => this.readData(data));
	}

	readData(data)
	{
		if (data[0] == 4)
		{
			// EOT (control-D)
			return this.socket.end();
		}
		if (this.options.fast)
		{
			return this.socket.write(ERROR_BUFFER);
		}
		/*
		 * const message = data.toString();
		 * const line = message.substringUpTo('\r\n');
		 * const rest = message.substringFrom('\r\n');
		 * Code optimized below.
		 */
		let rn = 0;
		for (let i = 0; i < data.length; i++)
		{
			if (data[i] == 13 && data[i + 1] == 10)
			{
				rn = i;
				break;
			}
		}
		let line, rest;
		if (rn)
		{
			line = data.toString('utf8', 0, rn);
			rest = data.toString('utf8', rn + 2);
		}
		else
		{
			line = data.toString('utf8');
		}
		// end optimization
		let result = this.parser.readLine(line);
		if (rest)
		{
			if (result)
			{
				log.error('Unexpected result %s, ignoring', result);
			}
			result = this.parser.readLine(rest);
		}
		if (result == 'quit')
		{
			log.info('Quitting');
			return this.socket.end();
		}
		if (result)
		{
			this.socket.write(result + '\r\n');
		}
	}
}

/**
 * Test that the server starts and stops.
 */
function testStart(callback)
{
	const options = {
		port: 11234,
	};
	const server = start(options, function(error)
	{
		testing.check(error, 'Could not start server');
		stop(server, callback);
	});
}

/**
 * Run all tests.
 */
function test(callback)
{
	log.debug('Running tests');
	testing.run([testStart], callback);
}

// run tests if invoked directly
if (__filename == process.argv[1])
{
	if (process.argv.length == 3)
	{
		new exports.Server({
			port: parseInt(process.argv[2], 10),
		});
	}
	exports.test(testing.show);
}

module.exports = {start, stop, Server, test}

