'use strict';
/* jshint camelcase: false */

/**
 * nodecached client.
 * (C) 2013 Alex Fernández.
 */


// requires
require('prototypes');
const token = require('./token.js');
const {create} = require('./server.js');
const syntaxes = require('./syntaxes.js');
const packageJson = require('../package.json');
const Log = require('log');
const net = require('net');
const async = require('async');
const testing = require('testing');

// constants
const TIMEOUT = 5000;


class Client {
	/**
	 * Create a client. Params:
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
	constructor(locations, options, callback) {
		this.connections = {};
		this.log = new Log('notice');
		this.locations = locations
		this.options = options
		this.callback = callback
		this.init();
	}

	init() {
		if (this.options.info)
		{
			this.log = new Log('info');
		}
		if (this.options.debug)
		{
			this.log = new Log('debug');
		}
		this.options.log = this.log;
		for (const operation in syntaxes.commandMap)
		{
			this[operation] = this.getDistributor(operation);
		}
		this.initConnections();
	}

	/**
	 * Returns a function to distribute an operation to a connection.
	 */
	getDistributor(name) {
		return () => {
			const connection = this.pickRandomConnection();
			const commandFunction = connection[name];
			if (!commandFunction)
			{
				this.log.error('Connection missing the %s function', name);
				return;
			}
			console.log(arguments)
			commandFunction.apply(connection, arguments);
		};
	}

	pickRandomConnection() {
		let totalWeight = 0;
		for (const location in this.connections)
		{
			totalWeight += this.connections[location].weight;
		}
		let targetWeight = Math.random() * totalWeight;
		for (const location in this.connections)
		{
			targetWeight -= this.connections[location].weight;
			if (targetWeight <= 0)
			{
				return this.connections[location];
			}
		}
		this.log.error('Could not pick winning connection');
		return null;
	}

	initConnections() {
		const tasks = {};
		if (typeof this.locations == 'string')
		{
			tasks[this.locations] = this.getConnectionCreator(this.locations);
		}
		else if (Array.isArray(this.locations))
		{
			this.locations.forEach(location => {
				tasks[location] = this.getConnectionCreator(location);
			});
		}
		else if (typeof this.locations == 'object')
		{
			for (const key in this.locations)
			{
				tasks[key] = this.getConnectionCreator(key);
			}
		}
		else
		{
			this.log.error('Invalid location %s: must be string, array of strings or object', this.locations);
			return;
		}
		async.parallel(tasks, (error, result) => {
			if (error)
			{
				this.log.error('Could not create connections: %s', error);
				return this.callback(error);
			}
			const weight = 1 / result.countProperties();
			for (const location in result)
			{
				const connection = result[location];
				if (connection)
				{
					connection.weight = weight;
				}
				this.connections[location] = connection;
			}
			this.callback(null);
		});
	}

	getConnectionCreator(location) {
		return callback => {
			const connection = new ServerConnection(location, this.options, error => {
				if (error)
				{
					this.log.error('Could not initialize server on %s', location);
					return callback(null);
				}
				callback(null, connection);
			});
		}
	}

	end(callback) {
		this.log.debug('Ending the client: %j', this.connections);
		const tasks = {};
		for (const location in this.connections)
		{
			tasks[location] = this.getCloser(this.connections[location]);
		}
		async.parallel(tasks, callback);
	}

	getCloser(connection) {
		return callback => {
			connection.end(callback);
		};
	}
}

class ServerConnection {
	constructor(location, options, callback) {
		this.location = location
		this.options = options
		this.callback = callback
		this.connection = null;
		this.pending = callback;
		this.log = options.log;
		this.weight = 0;
		this.init();
	}

	init() {
		if (!this.location.contains(':'))
		{
			this.log.error('Invalid location %s', this.location);
			return;
		}
		const params = {
			host: this.location.substringUpTo(':'),
			port: parseInt(this.location.substringFrom(':'), 10),
		};
		if (!params.port)
		{
			this.log.error('Invalid non-numeric or zero port in location %s', this.location);
			return;
		}
		this.connection = net.connect(params);
		this.connection.setTimeout(this.options.timeout || TIMEOUT);
		if (!this.options.delay)
		{
			this.connection.setNoDelay();
		}
		this.connection.on('connect', () => {
			this.log.info('Client connected to server');
			if (this.pending)
			{
				this.pending(null);
			}
		});
		this.connection.on('end', () => {
			this.log.info('Client disconnected from server');
			if (this.pending)
			{
				this.pending(null);
			}
		});
		this.connection.on('error', error => {
			this.log.error('Connection error: %s', error);
			if (this.pending)
			{
				this.pending(error);
			}
			this.connection.destroy();
		});
		this.connection.on('data', data => {
			if (this.options.noResponse)
			{
				return this.pending(null);
			}
			this.log.debug('Received %s', data);
			if (!this.pending)
			{
				this.log.error('Unexpected data %s', data);
				return;
			}
			const message = String(data);
			if (message.length === 0)
			{
				return;
			}
			this.pending(null, message);
		});
		this.connection.on('timeout', () => {
			if (this.pending)
			{
				this.pending('timeout');
			}
		});
		for (const command in syntaxes.commandMap)
		{
			const syntax = syntaxes.getSyntax(command);
			if (syntax.order)
			{
				// cannot set up automatic command
				continue;
			}
			this[command] = this.getAutomaticCommander(command, syntax);
		}
	}

	/**
	 * Get a function to send a command.
	 */
	getAutomaticCommander(command, syntax) {
		return () => {
			let callback;
			const output = [syntax.command || command];
			for (const index in arguments)
			{
				const argument = arguments[index];
				if (typeof argument == 'function')
				{
					callback = argument;
				}
				else
				{
					output.push(argument);
				}
			}
			this.write(output.join(' ') + '\r\n');
			const mapped = syntaxes.remap(command);
			const parser = this['parse' + mapped.capitalize()];
			this.pending = this.getPending(mapped, callback, parser);
		};
	}

	write(message) {
		this.log.debug('Writing %s', message);
		this.connection.write(message);
	}

	parseGet(message, callback) {
		let parsed = this.parseGetMessage(message);
		if (!parsed)
		{
			return callback(null, parsed);
		}
		if (parsed.startsWith('{') && parsed.endsWith('}'))
		{
			try
			{
				parsed = JSON.parse(parsed);
			}
			catch(exception)
			{
				this.log.error('Fake json in %s: %s', parsed, exception);
			}
		}
		callback(null, parsed);
	}

	parseGetMessage(message)
	{
		const lines = message.split('\r\n');
		let line = lines.shift();
		const words = line.split(' ');
		let word = words.shift();
		if (word != 'VALUE')
		{
			this.log.error('Unknown token %s in %s', word, lines);
			return null;
		}
		word = words.shift();
		word = words.shift();
		word = words.shift();
		if (!word)
		{
			this.log.error('Invalid length %s', word);
			return null;
		}
		const length = parseInt(word, 10);
		line = lines.shift();
		if (line.length != length)
		{
			this.log.error('Unexpected line length not %s in %s', length, line);
			return null;
		}
		return line;
	}

	set(key, value, exptime, callback) {
		this.setWith(key, value, exptime, 'set', callback);
	}

	add(key, value, exptime, callback) {
		this.setWith(key, value, exptime, 'add', callback);
	}

	replace(key, value, exptime, callback) {
		this.setWith(key, value, exptime, 'replace', callback);
	}

	append(key, value, callback) {
		this.setWith(key, value, 0, 'append', callback);
	}

	prepend(key, value, callback)
	{
		this.setWith(key, value, 0, 'prepend', callback);
	}

	setWith(key, value, exptime, command, callback)
	{
		console.log(`k ${key} v ${value} c ${command}`)
		this.pending = this.getPending('set', callback);
		let message = value;
		if (typeof value != 'string')
		{
			message = JSON.stringify(value);
		}
		this.write(command + ' ' + key + ' 0 ' + exptime + ' ' + message.length + '\r\n');
		this.write(message + '\r\n');
	}

	parseIncr(message, callback)
	{
		callback(null, parseInt(message, 10));
	}

	parseStats(message, callback)
	{
		const stats = {};
		const lines = message.split('\r\n');
		lines.forEach(line => {
			const words = line.split(' ');
			if (words[0] == 'STATS')
			{
				if (words.length != 3)
				{
					this.log.error('Invalid line %s', line);
					return;
				}
				stats[words[1]] = words[2];
			}
			else if (words[0] != 'END')
			{
				this.log.error('Unknown stats command %s', line);
			}
		});
		return callback(null, stats);
	}

	parseVersion(message, callback) {
		return callback(null, message.substringFrom(' '));
	}

	getPending(command, callback, handler) {
		if (this.options.noResponse)
		{
			return callback;
		}
		return (error, result) => {
			if (error)
			{
				return callback(error);
			}
			result = result.trim();
			if (result == 'ERROR' || result.startsWith('CLIENT_ERROR '))
			{
				return callback(result);
			}
			const output = this.getOutput(command);
			for (const key in output)
			{
				this.log.debug('Checking %s: %s', key, output[key]);
				if (output[key] == result)
				{
					let mapped;
					try
					{
						mapped = JSON.parse(key);
					}
					catch(error)
					{
						this.log.error('Could not parse %s', key);
						return callback('Invalid result ' + result);
					}
					return callback(null, mapped);
				}
			}
			if (!handler)
			{
				this.log.error('Unrecognized result %s for command %s', result, command);
				return callback('Unrecognized result ' + result);
			}
			return handler(result, callback);
		};
	}

	getOutput(command) {
		const syntax = syntaxes.getSyntax(command);
		if (!syntax)
		{
			this.log.error('No syntax for command %s', command);
			return null;
		}
		this.log.debug('Output: %j', syntax.output);
		return syntax.output;
	}

	end(callback)
	{
		this.log.debug('Ending the connection to %s', this.location);
		this.pending = callback;
		this.connection.end();
	}
}

/**
 * Test get, set and delete.
 */
function testGetSetDelete(callback)
{
	const key = 'test#' + token.create();
	const value = {
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
	const key = 'test#' + token.create();
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
 * Test append and prepend.
 */
function testAppendPrepend(callback)
{
	const key = 'test#' + token.create();
	const value = {
		a: 'b',
	};
	runTest(11245, function(client, rest)
	{
		client.set(key, value, 10, function(error, result)
		{
			testing.check(error, 'Could not set value', callback);
			testing.assertEquals(result, true, 'Invalid set result', callback);
			client.append(key, 'aa', function(error, result)
			{
				testing.check(error, 'Could not append value', callback);
				testing.assert(result, 'Not appended', callback);
				client.get(key, function(error, result)
				{
					testing.check(error, 'Could not get value', callback);
					const appended = JSON.stringify(value) + 'aa';
					testing.assertEquals(result, appended, 'Invalid get result', callback);
					client.prepend(key, 'bb', function(error, result)
					{
						testing.check(error, 'Could not prepend value', callback);
						testing.assertEquals(result, true, 'Invalid prepend result', callback);
						client.get(key, function(error, result)
						{
							testing.check(error, 'Could not get value', callback);
							testing.assertEquals(result, 'bb' + appended, 'Invalid prepended result', callback);
							rest();
						});
					});
				});
			});
		});
	}, callback);
}

/**
 * Test incr and decr.
 */
function testIncrDecr(callback)
{
	const key = 'test#' + token.create();
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
	const key = 'test#' + token.create();
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
	const key = 'test#' + token.create();
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
			testing.assertEquals(stats.version, getVersion(), 'Invalid version', callback);
			testing.assertEquals(stats.total_items, 0, 'Invalid total items', callback);
			rest();
		});
	}, callback);
}

/**
 * Get the current version.
 */
function getVersion()
{
	return packageJson.name + '-' + packageJson.version;
}

/**
 * Test other commands.
 */
function testOthers(callback)
{
	runTest(11241, function(client, rest)
	{
		client.flush(function(error, result)
		{
			testing.check(error, 'Could not flush', callback);
			testing.assertEquals(result, true, 'Invalid flush result', callback);
			client.version(function(error, result)
			{
				testing.check(error, 'Could not version', callback);
				testing.assertEquals(result, getVersion(), 'Invalid version', callback);
				rest();
			});
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
	const options = {
		port: port,
	};
	const location = 'localhost:' + options.port;
	const server = create()
	server.start(options, function(error)
	{
		testing.check(error, 'Could not start server', callback);
		const client = new Client(location, options, function(error)
		{
			testing.check(error, 'Could not create client', callback);
			test(client, function()
			{
				client.end(function(error)
				{
					testing.check(error, 'Could not stop client', callback);
					server.stop(callback);
				});
			});
		});
	});
}

/**
 * Run all tests.
 */
function test(callback)
{
	testing.run([
		testGetSetDelete,
		testNotFound,
		testAppendPrepend,
		testIncrDecr,
		testInvalidIncr,
		testTouch,
		testStats,
		testOthers,
	], callback);
}

// run tests if invoked directly
if (__filename == process.argv[1])
{
	test(testing.show);
}

module.exports = {test, Client}

