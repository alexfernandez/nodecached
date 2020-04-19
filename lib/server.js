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


function create() {
	return new Server()
}

/**
 */
class Server
{
	constructor() {
		this.log = new Log('info');
		this.server = null;
	}

	/*
	 * Start the server. Options:
	 *	- port: to listen on.
	 *	- fast: return 'ERROR' on every query.
	 *	- notice: show notice messages.
	 *	- info: show info messages.
	 *	- debug: show debug messages.
	 * An optional callback will be called after the server has started.
	 */
	start(options, callback)
	{
		const port = options.port || DEFAULT_PORT;
		return this.startPromise(port, options).then(() => {
			if (callback) return callback()
			this.log.notice('Started server on port %s', port);
		}).catch(error => {
			const message = 'Could not start server on port ' + port + ': ' + error;
			if (callback) return callback(message)
			this.log.error(message);
		})
	}

	startPromise(port, options) {
		return new Promise((resolve, reject) => {
			for (const i in LOG_LEVELS)
			{
				const level = LOG_LEVELS[i];
				if (options[level])
				{
					this.log = new Log(level);
				}
			}
			this.server = net.createServer(socket => {
				new Connection(options, this.log).init(socket);
			});
			this.server.on('error', reject)
			this.server.listen(port, resolve)
		})
	}

	stop(callback)
	{
		const cb = () => 0
		this.stopPromise().then(callback || cb).catch(callback || cb)
	}

	stopPromise() {
		return new Promise((resolve, reject) => {
			this.server.close(error => {
				if (error) return reject(error)
				return resolve()
			});
		})
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
		this.log.info('Client connected to server');
		if (!this.options.delay)
		{
			socket.setNoDelay();
		}
		socket.on('end', () => {
			this.log.info('Client disconnected from server');
		});
		socket.on('error', error => {
			this.log.info('Socket error: %s', error);
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
		const {line, rest} = this.parseLine(data)
		const result = this.processCommand(line, rest)
		if (!result) {
			return
		}
		if (result == 'quit')
		{
			this.log.info('Quitting');
			return this.socket.end();
		}
		this.socket.write(result + '\r\n');
	}
	/*
	 * Parse a line. Equivalent to:
	 * const message = data.toString();
	 * const line = message.substringUpTo('\r\n');
	 * const rest = message.substringFrom('\r\n');
	 */
	parseLine(data) {
		for (let i = 0; i < data.length; i++)
		{
			if (data[i] == 13 && data[i + 1] == 10)
			{
				return {
					line: data.toString('utf8', 0, i),
					rest: data.toString('utf8', i + 2),
				}
			}
		}
		return {line: data.toString('utf8')}
	}
	processCommand(line, rest) {
		const result = this.parser.readLine(line);
		if (result) {
			if (rest) {
				this.log.error('Unexpected result %s, ignoring', result);
			}
			return result
		}
		return this.parser.readLine(rest);
	}
}

async function testStart() {
	const server = create()
	await server.start({port: 11234})
	console.log('holi')
	await server.stop();
}

/**
 * Run all tests.
 */
function test(callback)
{
	testing.run([testStart], callback);
}

module.exports = {create, test}

// run tests if invoked directly
if (__filename == process.argv[1])
{
	if (process.argv.length == 3)
	{
		new exports.Server().start({
			port: parseInt(process.argv[2], 10),
		});
	}
	module.exports.test(testing.show);
}

