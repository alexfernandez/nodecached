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
var INCR_SYNTAX = {
	key: String,
	value: Number,
};
var TOUCH_SYNTAX = {
	key: String,
	exptime: Number,
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
	incr: INCR_SYNTAX,
	decr: INCR_SYNTAX,
	touch: TOUCH_SYNTAX,
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
		try
		{
			return interpreter.interpret(command, options);
		}
		catch(exception)
		{
			return 'CLIENT_ERROR ' + exception.message;
		}
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
 * Test incr and decr lines.
 */
function testIncrDecr(callback)
{
	var key = 'test' + token.create();
	var parser = new exports.Parser();
	testing.assertEquals(parser.readLine('incr ' + key + ' 5'), 'NOT_FOUND', 'Should not incr', callback);
	testing.assertEquals(parser.readLine('set ' + key + ' 0 0 2'), '', 'Could not set', callback);
	testing.assertEquals(parser.readLine('10\r\n'), 'STORED', 'Could not set data', callback);
	testing.assertEquals(parser.readLine('incr ' + key + ' 5'), '15', 'Should incr', callback);
	testing.assertEquals(parser.readLine('decr ' + key + ' 5'), '10', 'Should decr', callback);
	testing.assertEquals(parser.readLine('decr ' + key + ' 15'), '0', 'Should decr to 0', callback);
	testing.assertEquals(parser.readLine('set ' + key + ' 0 0 2'), '', 'Could not set second', callback);
	testing.assertEquals(parser.readLine('ab\r\n'), 'STORED', 'Could not set data', callback);
	var clientError = 'CLIENT_ERROR cannot increment or decrement non-numeric value';
	testing.assertEquals(parser.readLine('incr ' + key + ' 5'), clientError, 'Should not incr', callback);
	testing.success(callback);
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
	var key = 'test' + token.create();
	var parser = new exports.Parser();
	testing.assertEquals(parser.readLine('touch ' + key + ' 5'), 'NOT_FOUND', 'Should not touch', callback);
	testing.assertEquals(parser.readLine('set ' + key + ' 0 0 2'), '', 'Could not set', callback);
	testing.assertEquals(parser.readLine('10\r\n'), 'STORED', 'Could not set data', callback);
	testing.assertEquals(parser.readLine('touch ' + key + ' 5'), 'TOUCHED', 'Should touch', callback);
	testing.success(callback);
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	log.debug('Running tests');
	testing.run([
		testParseLines,
		testAddReplace,
		testIncrDecr,
		testStats,
		testOtherLines,
	], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

