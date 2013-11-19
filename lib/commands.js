'use strict';

/**
 * nodecached server: protocol implementation.
 * (C) 2013 Alex Fernández.
 */


// requires
require('prototypes');
var Cache = require('./memory.js').Cache;
var token = require('./token.js');
var Log = require('log');
var testing = require('testing');


// globals
var log = new Log('info');


/**
 * An interpreter for commands sent over the wire.
 * Each interpreter keeps its own 
 */
exports.Interpreter = function(options)
{
	// self-reference
	var self = this;

	// attributes
	var cache = new Cache(options);

	/**
	 * Interpret a command sent over the wire. Params:
	 *	- command: the command to interpret.
	 *	- options: passed after the command.
	 *	- data: optional contents after the line, as string.
	 * Returns the response to a command as a string.
	 */
	self.interpret = function(command, options, data)
	{
		if (!(command in self))
		{
			log.error('Invalid command %s', command);
			return 'ERROR';
		}
		var commandFunction = self[command];
		return commandFunction(options, data);
	};

	/**
	 * Get a value from the cache. Params:
	 *	- options: passed after the command.
	 * Returns the response.
	 */
	self.get = function(options)
	{
		var record = cache.getRecord(options.key);
		if (!record)
		{
			return 'END';
		}
		var data = record.value;
		if (typeof data != 'string')
		{
			data = JSON.stringify(record.value);
		}
		var flags = record.flags || '0';
		var bytes = data.length;
		var result = 'VALUE ' + options.key + ' ' + flags + ' ' + bytes + '\r\n';
		return result + data + '\r\nEND';
	};

	/**
	 * Set a value in the cache. Params:
	 *	- options: passed after the command.
	 *	- data: for the value.
	 * Returns the response.
	 */
	self.set = function(options, data)
	{
		return set(options, data, cache.setRecord);
	};

	/**
	 * Add a value to the cache, only if not present. Params: same as set().
	 */
	self.add = function(options, data)
	{
		return set(options, data, cache.addRecord);
	};

	/**
	 * Replace a value in the cache, only if already present. Params: same as set().
	 */
	self.replace = function(options, data)
	{
		return set(options, data, cache.replaceRecord);
	};

	/**
	 * Set a value in the cache using the given function.
	 */
	function set(options, data, fn)
	{
		options.value = data;
		if (fn(options.key, data, options.exptime, options.flags))
		{
			return 'STORED';
		}
		return 'NOT_STORED';
	}

	/**
	 * Delete a value from the cache. Params:
	 *	- options: passed after the command.
	 * Returns DELETED if found.
	 */
	self.delete = function(options)
	{
		if (cache.deleteRecord(options.key))
		{
			return 'DELETED';
		}
		return 'NOT_FOUND';
	};

	/**
	 * Show stats.
	 */
	self.stats = function(options)
	{
		var response = '';
		var stats = cache.stats(options.argument);
		for (var key in stats)
		{
			response += 'STATS ' + key + ' ' + stats[key] + '\r\n';
		}
		return response + 'END';
	};

	/**
	 * Show the version.
	 */
	self.version = function()
	{
		return 'VERSION ' + cache.version();
	};
};

/**
 * Test to interpret a few commands.
 */
function testInterpretCommands(callback)
{
	var key = 'test#' + token.create();
	var value = '{}';
	var options = {
		key: key,
	};
	var interpreter = new exports.Interpreter();
	var deleteResult = interpreter.interpret('delete', options);
	testing.assertEquals(deleteResult, 'NOT_FOUND', 'Could delete command before setting', callback);
	var getResult = interpreter.interpret('get', options);
	testing.assertEquals(getResult, 'END', 'Could get command before setting', callback);
	options.exptime = 0;
	var setResult = interpreter.interpret('set', options, value);
	testing.assertEquals(setResult, 'STORED', 'Could not set command', callback);
	getResult = interpreter.interpret('get', options);
	var expected = 'VALUE ' + key + ' 0 2\r\n{}\r\nEND';
	testing.assertEquals(getResult, expected, 'Could not get command after setting', callback);
	deleteResult = interpreter.interpret('delete', options);
	testing.assertEquals(deleteResult, 'DELETED', 'Could not delete command', callback);
	getResult = interpreter.interpret('get', options);
	testing.assertEquals(getResult, 'END', 'Could get command after deleting', callback);
	testing.success(callback);
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	log.debug('Running tests');
	testing.run({
		interpret: testInterpretCommands,
	}, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

