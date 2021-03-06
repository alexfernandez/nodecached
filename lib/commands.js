'use strict';

/**
 * nodecached server: protocol implementation.
 * (C) 2013 Alex Fernández.
 */


// requires
require('prototypes');
var Cache = require('./memory.js').Cache;
var token = require('./token.js');
var syntaxes = require('./syntaxes.js');
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
	 * Returns the response to a command as a string.
	 */
	self.interpret = function(command, options)
	{
		var commandFunction = cache[command];
		if (!commandFunction)
		{
			log.error('Command %s not in cache', command);
			return 'ERROR';
		}
		var syntax = syntaxes.getSyntax(command);
		if (!syntax)
		{
			log.error('Invalid command %s', command);
			return 'ERROR';
		}
		var args = [];
		var order = syntax.order || syntax.protocol;
		for (var key in order)
		{
			args.push(options[key]);
		}
		var result = commandFunction.apply(cache, args);
		log.debug('Result for %s: %s', command, result);
		var mapped = syntax.output[result];
		if (!mapped)
		{
			log.debug('Not mapped %s for %s', command, result);
			commandFunction = self[syntaxes.remap(command) + 'Reader'];
			if (!commandFunction)
			{
				log.error('Could not find reader for %s with %s', command, result);
				return 'ERROR';
			}
			return commandFunction.call(self, options, result);
		}
		log.debug('Mapped %s for %s: %s', command, result, mapped);
		return mapped;
	};

	/**
	 * Reader for the get command.
	 */
	self.getReader = function(options, got)
	{
		if (!got)
		{
			log.error('No record to get');
			return 'ERROR';
		}
		var record = cache.getRecord(options.key);
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
	 * Read the result of an incr command.
	 */
	self.incrReader = function(options, result)
	{
		return String(result);
	};

	/**
	 * Read the result of stats.
	 */
	self.statsReader = function(options, stats)
	{
		var response = '';
		for (var key in stats)
		{
			response += 'STATS ' + key + ' ' + stats[key] + '\r\n';
		}
		return response + 'END';
	};

	/**
	 * Show the version.
	 */
	self.versionReader = function(options, result)
	{
		return 'VERSION ' + result;
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

