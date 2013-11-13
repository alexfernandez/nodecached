'use strict';

/**
 * nodecached server: memory functions.
 * (C) 2013 Alex Fernández.
 */


// requires
var Log = require('log');
var testing = require('testing');

// globals
var cache = {};
var log = new Log('info');


/**
 * Get something from the cache. Params:
 *	- key: the key to look up.
 * Returns the current record (with key, flags, expiration and value), or null if not in the cache.
 */
exports.get = function(key)
{
	if (!(key in cache))
	{
		return null;
	}
	var record = cache[key];
	if (!record.isValid())
	{
		return null;
	}
	return record;
};

/**
 * Set something in the cache. Params:
 *	- key: the key to look up.
 *	- flags: to store with the value.
 *	- expirationSeconds: the number of seconds that the item must live, at most.
 *	- value: the value to store.
 * Returns true if the item was stored.
 */
exports.set = function(key, flags, expirationSeconds, value)
{
	cache[key] = new Record(flags, expirationSeconds, value);
	return true;
};

/**
 * Delete a record from the cache. Params:
 *	- key: the key to look up.
 * Returns true if the item was deleted, false if not in the cache.
 */
exports.delete = function(key)
{
	if (!(key in cache))
	{
		return false;
	}
	delete cache[key];
	return true;
};

/**
 * Test to get, set and delete a test value.
 */
function testGetSetDelete(callback)
{
	var key = 'test#';
	var value = {};
	testing.assertEquals(exports.get(key), null, 'Could get key before setting it', callback);
	testing.assert(exports.set(key, 0, value), 'Could not set key', callback);
	testing.assert(exports.delete(key), 'Could not delete key', callback);
	testing.assertEquals(exports.get(key), null, 'Could get key after deleting it', callback);
	testing.success(callback);
}

/**
 * A record to store in memory.
 */
var Record = function(flags, expirationSeconds, value)
{
	// self-reference
	var self = this;

	self.flags = flags;
	self.expiration = Date.now() + 1000 * expirationSeconds;
	self.value = value;

	/**
	 * Find out if the record is still valid.
	 */
	self.isValid = function()
	{
		log.info('Now: %s, expiration: %s', Date.now(), self.expiration);
		return (Date.now() < self.expiration);
	};
};

/**
 * Test record creation.
 */
function testRecord(callback)
{
	var record = new Record(null, 1, 'b');
	testing.assert(record.isValid(), 'Should be valid', callback);
	record = new Record(null, -1, 'b');
	testing.assert(!record.isValid(), 'Should not be valid', callback);
	testing.success(callback);
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	log.debug('Running tests');
	testing.run({
		getSet: testGetSetDelete,
		record: testRecord,
	}, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}


