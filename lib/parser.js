'use strict';

/**
 * Caching server: protocol implementation.
 * (C) 2013 Alex Fernández.
 */


// requires
require('prototypes');
var commands = require('./commands.js');
var Log = require('log');
var testing = require('testing');

// constants
var SET_SYNTAX = {
	key: String,
	flags: Number,
	exptime: Number,
	bytes: Number,
};
var GET_SYNTAX = {
	key: String,
};
var DELETE_SYNTAX = {
	key: String,
};
var SYNTAXES = {
	set: SET_SYNTAX,
	get: GET_SYNTAX,
	delete: DELETE_SYNTAX,
};

// globals
var log = new Log('info');


/**
 * A parser for commands.
 */
exports.Parser = function()
{
	// self-reference
	var self = this;

	// init
	reset();

	/**
	 * Reset all values.
	 */
	function reset()
	{
		self.command = null;
		self.options = null;
		self.data = '';
		self.bytesRemaining = 0;
	}

	/**
	 * Read a line, return a response if present.
	 */
	self.readLine = function(line)
	{
		if (!self.command)
		{
			return readCommand(line);
		}
		else
		{
			return readData(line);
		}
	};

	/**
	 * Read a command line.
	 */
	function readCommand(line)
	{
		var words = line.trim().split(/\s+/);
		var command = words.shift();
		var syntax = SYNTAXES[command];
		if (!syntax)
		{
			return 'ERROR';
		}
		var options = {};
		for (var key in syntax)
		{
			var type = syntax[key];
			if (words.length === 0)
			{
				return 'CLIENT_ERROR bad command line format';
			}
			var word = words.shift();
			options[key] = type(word);
		}
		if (words.length !== 0)
		{
			return 'ERROR';
		}
		if (options.bytes)
		{
			return pendingData(command, options);
		}
		return commands.interpret(command, options);
	}

	/**
	 * There is pending data to read.
	 */
	function pendingData(command, options)
	{
		self.command = command;
		self.options = options;
		log.debug('Expecting %s bytes', self.bytesRemaining);
		self.bytesRemaining = options.bytes;
		return '';
	}

	/**
	 * Read a line with data.
	 */
	function readData(line)
	{
		if (line.length < self.bytesRemaining)
		{
			self.data += line;
			self.bytesRemaining -= line.length;
			return '';
		}
		line = rightTrim(line, '\n');
		line = rightTrim(line, '\r');
		if (line.length > self.bytesRemaining)
		{
			log.debug('Expected %s but got %s', self.bytesRemaining, line.length);
			reset();
			return 'CLIENT_ERROR bad data chunk';
		}
		self.data += line;
		var result = commands.interpret(self.command, self.options, self.data);
		reset();
		return result;
	}

	/**
	 * Trim a character on the right of the line.
	 */
	function rightTrim(line, character)
	{
		if (line.endsWith(character))
		{
			return line.substringUpToLast(character);
		}
		return line;
	}
};

/**
 * Test to parse a few command lines.
 */
function testParseLines(callback)
{
	var parser = new exports.Parser();
	testing.assertEquals(parser.readLine('get test'), 'END', 'Could not get test', callback);
	testing.assertEquals(parser.readLine('set test'), 'CLIENT_ERROR bad command line format', 'Could not set empty test', callback);
	testing.assertEquals(parser.readLine('set test 0 0 10'), '', 'Could not set correct test', callback);
	testing.assertEquals(parser.readLine('01234567890\r\n'), 'CLIENT_ERROR bad data chunk', 'Could not set incorrect data', callback);
	testing.assertEquals(parser.readLine('set test 0 0 10'), '', 'Could not set correct second', callback);
	testing.assertEquals(parser.readLine('0123456789\r\n'), 'STORED', 'Could not set data', callback);
	testing.assertEquals(parser.readLine('get test'), 'VALUE test 0 10\r\n0123456789\r\nEND', 'Could not get data', callback);
	testing.assertEquals(parser.readLine('delete test'), 'DELETED', 'Could not get after deleting', callback);
	testing.assertEquals(parser.readLine('get test'), 'END', 'Could not get after deleting', callback);
	testing.success(callback);
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	log.debug('Running tests');
	testing.run({
		parse: testParseLines,
	}, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

