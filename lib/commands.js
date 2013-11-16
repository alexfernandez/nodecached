'use strict';

/**
 * nodecached server: protocol implementation.
 * (C) 2013 Alex Fernández.
 */


// requires
require('prototypes');
var memory = require('./memory.js');
var token = require('./token.js');
var Log = require('log');
var testing = require('testing');


// globals
var Record = memory.Record;
var commands = {
	set: setCommand,
	get: getCommand,
	delete: deleteCommand,
};
var log = new Log('info');


/**
 * Interpret a command sent over the wire. Params:
 *	- command: the command to interpret.
 *	- options: passed after the command.
 *	- data: optional contents after the line, as string.
 * Returns the response to a command as a string.
 */
exports.interpret = function(command, options, data)
{
	if (!(command in commands))
	{
		log.error('Invalid command %s', command);
		return 'ERROR';
	}
	var commandFunction = commands[command];
	return commandFunction(options, data);
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
	var deleteResult = exports.interpret('delete', options);
	testing.assertEquals(deleteResult, 'NOT_FOUND', 'Could delete command before setting', callback);
	var getResult = exports.interpret('get', options);
	testing.assertEquals(getResult, 'END', 'Could get command before setting', callback);
	options.exptime = 0;
	var setResult = exports.interpret('set', options, value);
	testing.assertEquals(setResult, 'STORED', 'Could not set command', callback);
	getResult = exports.interpret('get', options);
	var expected = 'VALUE ' + key + ' 0 2\r\n{}\r\nEND';
	testing.assertEquals(getResult, expected, 'Could not get command after setting', callback);
	deleteResult = exports.interpret('delete', options);
	testing.assertEquals(deleteResult, 'DELETED', 'Could not delete command', callback);
	getResult = exports.interpret('get', options);
	testing.assertEquals(getResult, 'END', 'Could get command after deleting', callback);
	testing.success(callback);
}

/**
 * Command to set a value in the cache. Params:
 *	- options: passed after the command.
 *	- data: for the value.
 * Returns the response.
 */
function setCommand(options, data)
{
	var record = new Record(options.flags, options.exptime, data);
	if (memory.setRecord(options.key, record))
	{
		return 'STORED';
	}
	return 'NOT_STORED';
}

/**
 * Command to get a value from the cache. Params:
 *	- options: passed after the command.
 * Returns the response.
 */
function getCommand(options)
{
	var record = memory.getRecord(options.key);
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
}

/**
 * Command to delete a value from the cache. Params:
 *	- options: passed after the command.
 * Returns the response.
 */
function deleteCommand(options)
{
	if (memory.deleteRecord(options.key))
	{
		return 'DELETED';
	}
	return 'NOT_FOUND';
}

/**
 * Test the delete command. Not very interesting but jshint complains otherwise.
 */
function testDeleteCommand(callback)
{
	testing.assertEquals(deleteCommand({}), 'NOT_FOUND', 'Delete command failed', callback);
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
		delete: testDeleteCommand,
	}, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

