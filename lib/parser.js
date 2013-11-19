'use strict';

/**
 * nodecached server: protocol implementation.
 * (C) 2013 Alex Fernández.
 */


// requires
require('prototypes');
var Interpreter = require('./commands.js').Interpreter;
var token = require('./token.js');
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
var STATS_SYNTAX = {
	argument: OptionalString,
};
var QUIT_SYNTAX = {};
var SYNTAXES = {
	get: GET_SYNTAX,
	set: SET_SYNTAX,
	add: SET_SYNTAX,
	replace: SET_SYNTAX,
	delete: DELETE_SYNTAX,
	stats: STATS_SYNTAX,
	quit: QUIT_SYNTAX,
	version: QUIT_SYNTAX,
};

// globals
var log = new Log('info');


/**
 * Parse an optional string. If not present just return undefined.
 */
function OptionalString(argument)
{
	if (!argument)
	{
		return undefined;
	}
	return String(argument);
}

/**
 * A parser for commands.
 * Options will be passed to interpreter and to cache.
 */
exports.Parser = function(options)
{
	// self-reference
	var self = this;

	// attributes
	var interpreter = new Interpreter(options);

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
		if (command == 'quit')
		{
			return command;
		}
		var syntax = SYNTAXES[command];
		if (!syntax)
		{
			log.error('No syntax for command %s', command);
			return 'ERROR';
		}
		var options = {};
		for (var key in syntax)
		{
			var type = syntax[key];
			if (words.length === 0 && type !== OptionalString)
			{
				return 'CLIENT_ERROR bad command line format';
			}
			var word = words.shift();
			options[key] = type(word);
		}
		if (words.length !== 0)
		{
			log.error('Pending words for %s: %s', command, words.join(', '));
			return 'ERROR';
		}
		if (options.bytes)
		{
			return pendingData(command, options);
		}
		return interpreter.interpret(command, options);
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
		var result = interpreter.interpret(self.command, self.options, self.data);
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
 * Test to parse a few command lines: get, set, delete.
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
 * Test add and replace lines.
 */
function testAddReplace(callback)
{
	var key = 'test' + token.create();
	var parser = new exports.Parser();
	testing.assertEquals(sendLines(parser, 'replace ' + key, callback), 'NOT_STORED', 'Should not replace', callback);
	testing.assertEquals(sendLines(parser, 'add ' + key, callback), 'STORED', 'Should add', callback);
	testing.assertEquals(sendLines(parser, 'add ' + key, callback), 'NOT_STORED', 'Should not re-add', callback);
	testing.assertEquals(sendLines(parser, 'replace ' + key, callback), 'STORED', 'Should replace', callback);
	testing.success(callback);
}

/**
 * Send header and data.
 */
function sendLines(parser, command, callback)
{
	var header = command + ' 0 0 10';
	testing.assertEquals(parser.readLine(header), '', 'Should not get response to header', callback);
	var data = '0123456789\r\n';
	return parser.readLine(data);
}

/**
 * Test that stats works.
 */
function testStats(callback)
{
	var parser = new exports.Parser();
	var stats = parser.readLine('stats');
	var lines = stats.split('\r\n');
	var end = lines.splice(-1);
	testing.assertEquals(end, 'END', 'Invalid ending', callback);
	lines.forEach(function(line)
	{
		log.debug('Line: %s', line);
		testing.assert(line.startsWith('STATS '), 'Invalid stats start: ' + line, callback);
		testing.assertEquals(line.split(' ').length, 3, 'Invalid stats line', callback);
	});
	testing.success(callback);
}

/**
 * Test less common commands.
 */
function testOtherLines(callback)
{
	testing.success(callback);
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	log.debug('Running tests');
	testing.run({
		testParse: testParseLines,
		testAddReplace: testAddReplace,
		testStats: testStats,
		testOther: testOtherLines,
	}, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

