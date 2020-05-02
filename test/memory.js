'use strict';
/* jshint camelcase: false */

/**
 * nodecached server: memory functions.
 * (C) 2013 Alex Fernández.
 */


// requires
const testing = require('testing');
const token = require('../lib/token.js');
const {Record, Cache} = require('../lib/memory.js')


/**
 * Test record creation.
 */
function testRecord(callback)
{
	const record1 = new Record('b', 1, null);
	testing.assert(record1.isValid(), 'Should be valid', callback);
	const record2 = new Record('b', -1, null);
	testing.assert(!record2.isValid(), 'Should not be valid', callback);
	testing.success(callback);
}

/**
 * Test to get, set and delete a test record.
 */
function testGetSet(callback)
{
	const key = 'test#' + token.create();
	const value = {a: 'b'};
	const cache = new Cache();
	testing.assertEquals(cache.get(key), null, 'Could get record before setting it', callback);
	testing.assert(cache.set(key, value), 'Could not set record', callback);
	testing.assertEquals(cache.get(key), value, 'Got different record', callback);
	testing.assert(cache.append(key, 'aa'), 'Could not append', callback);
	const appended = JSON.stringify(value) + 'aa';
	testing.assertEquals(cache.get(key), appended, 'Invalid appended', callback);
	testing.assert(cache.prepend(key, 'bb'), 'Could not preppend', callback);
	testing.assertEquals(cache.get(key), 'bb' + appended, 'Invalid prepended', callback);
	testing.assert(cache.delete(key), 'Could not delete record', callback);
	testing.assertEquals(cache.get(key), null, 'Could get record after deleting it', callback);
	testing.success(callback);
}

/**
 * Test the stats function.
 */
function testStats(callback)
{
	const key = 'test#' + token.create();
	const value = {a: 'b'};
	const cache = new Cache();
	testing.assert(cache.set(key, value), 'Could not set record 1', callback);
	testing.assert(cache.set(key, value), 'Could not set record 2', callback);
	const stats = cache.stats();
	testing.assert(stats, 'Could not get stats', callback);
	testing.assertEquals(stats.curr_items, 1, 'Invalid curr_items', callback);
	testing.assertEquals(stats.total_items, 2, 'Invalid total_items', callback);
	testing.success(callback);
}

/**
 * Test incr and decr.
 */
function testIncrDecr(callback)
{
	const key = 'test#' + token.create();
	const cache = new Cache();
	testing.assert(cache.set(key, '10'), 'Should set record', callback);
	testing.assertEquals(cache.incr(key, 5), 15, 'Not incremented', callback);
	testing.assertEquals(cache.decr(key, 5), 10, 'Not decremented', callback);
	testing.assertEquals(cache.decr(key, 15), 0, 'Not decremented to 0', callback);
	testing.assert(cache.set(key, 'aaa'), 'Should set record again', callback);
	try
	{
		cache.incr(key, 5);
		testing.failure('Incr with non-number should fail', callback);
	}
	catch(exception)
	{
		testing.assert(exception.message.startsWith('cannot'), 'Invalid exception', callback);
	}
	testing.success(callback);
}

/**
 * Test other functions.
 */
function testOther(callback)
{
	const cache = new Cache();
	testing.assert(!cache.touch('a', 5), 'Should not touch invalid key', callback);
	testing.assert(cache.version().startsWith('nodecached'), 'Invalid version string', callback);
	testing.assert(cache.flush(), 'Not flushed', callback);
	testing.assert(cache.verbosity(5), 'No verbosity', callback);
	testing.success(callback);
}

/**
 * Test the jscache interface.
 * https://github.com/monsur/jscache
 */
function testJsCache(callback)
{
	const key = 'test#' + token.create();
	const value = {a: 'a'};
	const cache = new Cache();
	testing.assert(!cache.getItem(key), 'Should not getItem()', callback);
	testing.assertEquals(cache.size(), 0, 'Invalid size() before get', callback);
	cache.setItem(key, value);
	testing.assertEquals(cache.getItem(key), value, 'Invalid getItem()', callback);
	testing.assertEquals(cache.size(), 1, 'Invalid size() after set', callback);
	cache.removeItem(key);
	testing.assert(!cache.getItem(key), 'Should not getItem() after deleting it', callback);
	testing.assertEquals(cache.size(), 0, 'Invalid size() after delete', callback);
	testing.success(callback);
}

/**
 * Run all tests.
 */
function test(callback)
{
	testing.run([
		testRecord,
		testGetSet,
		testStats,
		testIncrDecr,
		testOther,
		testJsCache,
	], callback);
}

// run tests if invoked directly
if (__filename == process.argv[1])
{
	test(testing.show);
}

module.exports = {Cache, test}

