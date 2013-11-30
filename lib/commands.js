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

// constants
exports.resultMap = {
	get: {
		null: 'END',
	},
	set: {
		true: 'STORED',
		false: 'NOT_STORED',
	},
	delete: {
		true: 'DELETED',
		false: 'NOT_FOUND',
	},
	incr: {
		false: 'NOT_FOUND',
	},
	touch: {
		true: 'TOUCHED',
		false: 'NOT_FOUND',
	},
};
var commandMap = {
	add: 'set',
	replace: 'set',
	decr: 'incr',
};

// init
for (var key in commandMap)
{
	var mapped = commandMap[key];
	exports.resultMap[key] = exports.resultMap[mapped];
}


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
	 * Returns the response to a command as a string.
	 */
	self.interpret = function(command, options)
	{
		if (!self[command])
		{
			log.error('Invalid command %s', command);
			return 'ERROR';
		}
		var commandFunction = self[command];
		var result = commandFunction(options);
		var resultMap = exports.resultMap[command];
		if (!resultMap)
		{
			return result;
		}
		var mapped = resultMap[result];
		if (!mapped)
		{
			log.debug('Not mapped %s for %s: %s', command, result, mapped);
			return result;
		}
		log.debug('Mapped %s for %s: %s', command, result, mapped);
		return mapped;
	};

	/**
	 * Get a value from the cache. Params:
	 *	- options: passed after the command.
	 */
	self.get = function(options)
	{
		var record = cache.get(options.key);
		if (!record)
		{
			return record;
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
	 */
	self.set = function(options)
	{
		return set(options, cache.set);
	};

	/**
	 * Add a value to the cache, only if not present. Params: same as set().
	 */
	self.add = function(options)
	{
		return set(options, cache.add);
	};

	/**
	 * Replace a value in the cache, only if already present. Params: same as set().
	 */
	self.replace = function(options)
	{
		return set(options, cache.replace);
	};

	/**
	 * Set a value in the cache using the given function.
	 */
	function set(options, fn)
	{
		log.debug('Value: %s', options.value);
		return fn(options.key, options.value, options.exptime, options.flags);
	}

	/**
	 * Delete a value from the cache. Params:
	 *	- options: passed after the command.
	 * Returns DELETED if found.
	 */
	self.delete = function(options)
	{
		return cache.delete(options.key);
	};

	/**
	 * Increment a record. Params:
	 *	- options: passed after the command.
	 * Returns NOT_FOUND if not found, the value otherwise.
	 */
	self.incr = function(options)
	{
		return incrDecr(options, cache.incr);
	};

	/**
	 * Decrement a record. Params:
	 *	- options: passed after the command.
	 * Returns NOT_FOUND if not found, the value otherwise.
	 */
	self.decr = function(options)
	{
		return incrDecr(options, cache.decr);
	};

	/**
	 * Increment or decrement a value in the cache using the given function.
	 */
	function incrDecr(options, fn)
	{
		var result = fn(options.key, options.value);
		if (result === false)
		{
			return result;
		}
		return String(result);
	}

	/**
	 * Change expiration seconds.
	 */
	self.touch = function(options)
	{
		return cache.touch(options.key, options.exptime);
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
	var options = {
		key: key,
		value: '{}',
	};
	var interpreter = new exports.Interpreter();
	var deleteResult = interpreter.interpret('delete', options);
	testing.assertEquals(deleteResult, 'NOT_FOUND', 'Could delete command before setting', callback);
	var getResult = interpreter.interpret('get', options);
	testing.assertEquals(getResult, 'END', 'Could get command before setting', callback);
	options.exptime = 0;
	var setResult = interpreter.interpret('set', options);
	testing.assertEquals(setResult, 'STORED', 'Could not set command', callback);
	getResult = interpreter.interpret('get', options);
	var expected = 'VALUE ' + key + ' 0 2\r\n{}\r\nEND';
	testing.assertEquals(getResult, expected, 'Could not get command after setting', callback);
	deleteResult = interpreter.interpret('delete', options);
	testing.assertEquals(deleteResult, 'DELETED', 'Could not delete command', callback);
	var replaceResult = interpreter.interpret('replace', options);
	testing.assertEquals(replaceResult, 'NOT_STORED', 'Could store after deleting', callback);
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

