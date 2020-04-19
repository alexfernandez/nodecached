'use strict';

/**
 * nodecached: syntax definitions.
 * (C) 2013 Alex Fernández.
 */


// requires
require('prototypes');
var Log = require('log');
var testing = require('testing');

// globals
var log = new Log('info');

// constants

/**
 * Syntax for all commands. For each command:
 *	- protocol: parsing order and type for each parameter.
 *	- order: optional reordering of parameters for Cache.
 *	- output: mapping of Cache result to protocol output.
 */
var syntaxes = {
	get: {
		protocol: {
			key: String,
		},
		output: {
			null: 'END',
		},
	},
	set: {
		protocol: {
			key: String,
			flags: Number,
			exptime: Number,
			bytes: Number,
		},
		order: {
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
		protocol: {
			key: String,
		},
		output: {
			true: 'DELETED',
			false: 'NOT_FOUND',
		},
	},
	incr: {
		protocol: {
			key: String,
			value: Number,
		},
		output: {
			false: 'NOT_FOUND',
		},
	},
	touch: {
		protocol: {
			key: String,
			exptime: Number,
		},
		output: {
			true: 'TOUCHED',
			false: 'NOT_FOUND',
		},
	},
	stats: {
		protocol: {
			argument: OptionalString,
		},
		output: {},
	},
	flush: {
		protocol: {
			expiration: OptionalNumber,
		},
		output: {
			true: 'OK',
		},
		command: 'flush_all',
	},
	version: {
		protocol: {},
		output: {},
	},
	verbosity: {
		protocol: {
			level: Number,
		},
		output: {
			true: 'OK',
		},
	},
};
var remappings = {
	add: 'set',
	replace: 'set',
	append: 'set',
	prepend: 'set',
	decr: 'incr',
	flush_all: 'flush',
};

/**
 * Map of all commands.
 */
exports.commandMap = {};

for (var command in syntaxes)
{
	exports.commandMap[command] = true;
}
for (command in remappings)
{
	exports.commandMap[command] = true;
}


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
 * Parse an optional number. If not present just return undefined.
 */
function OptionalNumber(argument)
{
	if (!argument)
	{
		return undefined;
	}
	return Number(argument);
}

// set as optional
OptionalString.isOptional = true;
OptionalNumber.isOptional = true;

/**
 * Get the syntax for a command.
 */
exports.getSyntax = function(command)
{
	command = exports.remap(command);
	var syntax = syntaxes[command];
	if (!syntax)
	{
		return null;
	}
	return syntax;
};

exports.remap = function(command)
{
	if (command in remappings)
	{
		return remappings[command];
	}
	return command;
};

/**
 * Test the syntax files.
 */
function testSyntax(callback)
{
	var syntax = exports.getSyntax('decr');
	testing.assert(syntax, 'No syntax for decr', callback);
	testing.assert(syntax.protocol, 'No protocol for decr', callback);
	testing.assertEquals(syntax.protocol.countProperties(), 2, 'Invalid protocol for decr', callback);
	testing.assert(!exports.getSyntax('unobtanium'), 'Syntax for unobtanium', callback);
	testing.success(callback);
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	log.debug('Running tests');
	testing.run([testSyntax], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

