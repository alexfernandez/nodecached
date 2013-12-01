'use strict';

/**
 * nodecached server: node-memcached interface.
 * https://github.com/3rd-Eden/node-memcached
 * (C) 2013 Alex Fernández.
 */


// requires
var Log = require('log');
var Cache = require('./memory.js').Cache;
var token = require('./token.js');
var syntaxes = require('./syntaxes.js');
var testing = require('testing');

// globals
var defaultCache = null;
var log = new Log('info');

// init
for (var command in syntaxes.commandMap)
{
	exports[command] = function()
	{
		var cache = getDefaultCache();
		var fn = cache[command];
		var params = getParams(arguments);
		var result = fn.apply(cache, params.args);
		if (params.callback)
		{
			params.callback(null, result);
		}
	};
}

/**
 * Get arguments and callback.
 */
function getParams(params)
{
	var result = {
		args: {},
	};
	for (var key in params)
	{
		var param = params[key];
		if (typeof param == 'function')
		{
			result.callback = param;
		}
		else
		{
			result.args[key] = param;
		}
	}
	return result;
}

/**
 * Get the default cache, or create it if necessary.
 */
function getDefaultCache()
{
	if (!defaultCache)
	{
		log.debug('Creating default cache');
		defaultCache = new Cache(0);
	}
	return defaultCache;
}

/**
 * Test get, set and delete.
 */
function testGetSetDelete(callback)
{
	var key = 'test#' + token.create();
	var value = {a: 'b'};
	exports.get(key, function(error, result)
	{
		testing.check(error, 'Error getting first', callback);
		testing.assert(!result, 'Should not get', callback);
		exports.set(key, value, 10, function(error, result)
		{
			testing.check(error, 'Error setting', callback);
			testing.assert(result, 'Could not set', callback);
			exports.get(key, function(error, result)
			{
				testing.check(error, 'Error getting', callback);
				testing.assert(result, 'Could not get', callback);
				testing.assertEquals(result, value, 'Different get', callback);
				exports.delete(key, function(error, result)
				{
					testing.check(error, 'Error deleting', callback);
					testing.assert(result, 'Could not delete', callback);
					exports.get(key, function(error, result)
					{
						testing.check(error, 'Error getting last', callback);
						testing.assert(!result, 'Should not get last', callback);
						testing.success(callback);
					});
				});
			});
		});
	});
}

/**
 * Test append and prepend.
 */
function testAppendPrepend(callback)
{
	var key = 'test#' + token.create();
	var value = 'abcde';
	exports.set(key, value, 10, function(error, result)
	{
		testing.check(error, 'Error in set', callback);
		testing.assert(result, 'Should set', callback);
		exports.append(key, 'fg', function(error, result)
		{
			testing.check(error, 'Error in append', callback);
			testing.assert(result, 'Should append', callback);
			exports.prepend(key, 'z', function(error, result)
			{
				testing.check(error, 'Error in prepend', callback);
				testing.assert(result, 'Should prepend', callback);
				exports.get(key, function(error, result)
				{
					testing.check(error, 'Error in get', callback);
					testing.assertEquals(result, 'zabcdefg', 'Invalid get', callback);
					testing.success(callback);
				});
			});
		});
	});
}

/**
 * Test incr, decr and touch.
 */
function testIncrDecrTouch(callback)
{
	var key = 'test#' + token.create();
	exports.incr(key, 5, function(error, result)
	{
		testing.check(error, 'Error in incr', callback);
		testing.assert(!result, 'Should not incr', callback);
		exports.decr(key, 6, function(error, result)
		{
			testing.check(error, 'Error in decr', callback);
			testing.assert(!result, 'Should not decr', callback);
			exports.touch(key, 0, function(error, result)
			{
				testing.check(error, 'Error in touch', callback);
				testing.assert(!result, 'Should not touch', callback);
				testing.success(callback);
			});
		});
	});
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	log.debug('Running tests');
	testing.run([
		testGetSetDelete,
		testAppendPrepend,
		testIncrDecrTouch,
	], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}


