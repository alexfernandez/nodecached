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
exports.commandSyntaxes = {
	get: {
		input: {
			key: true,
		},
		output: {
			null: 'END',
		},
	},
	set: {
		input: {
			key: true,
			value: true,
			exptime: true,
			flags: true,
		},
		output: {
			true: 'STORED',
			false: 'NOT_STORED',
		},
	},
	delete: {
		input: {
			key: true,
		},
		output: {
			true: 'DELETED',
			false: 'NOT_FOUND',
		},
	},
	incr: {
		input: {
			key: true,
			value: true,
		},
		output: {
			false: 'NOT_FOUND',
		},
	},
	touch: {
		input: {
			key: true,
			exptime: true,
		},
		output: {
			true: 'TOUCHED',
			false: 'NOT_FOUND',
		},
	},
	stats: {
		input: {
			argument: true,
		},
		output: {},
	},
	version: {
		input: {},
		output: {},
	},
};
var remappings = {
	add: 'set',
	replace: 'set',
	decr: 'incr',
};


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
		command = remap(command);
		var syntax = exports.commandSyntaxes[command];
		if (!syntax)
		{
			log.error('Invalid command %s', command);
			return 'ERROR';
		}
		var args = [];
		for (var key in syntax.input)
		{
			args.push(options[key]);
		}
		var result = commandFunction.apply(cache, args);
		log.debug('Result for %s: %s', command, result);
		var mapped = syntax.output[result];
		if (!mapped)
		{
			log.debug('Not mapped %s for %s', command, result);
			commandFunction = self[command + 'Reader'];
			return commandFunction.call(self, options, result);
		}
		log.debug('Mapped %s for %s: %s', command, result, mapped);
		return mapped;
	};

	/**
	 * Remap a command if necessary.
	 */
	function remap(command)
	{
		var remapped = remappings[command];
		return remapped || command;
	}

	/**
	 * Reader for the get command.
	 */
	self.getReader = function(options, record)
	{
		if (!record)
		{
			log.error('No record to get');
			return 'ERROR';
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

