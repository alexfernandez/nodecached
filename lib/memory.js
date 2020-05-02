'use strict';
/* jshint camelcase: false */

/**
 * nodecached server: memory functions.
 * (C) 2013 Alex Fernández.
 */


// requires
const Log = require('log');
const packageJson = require('../package.json');
const prototypes = require('prototypes');

// globals
const log = new Log('info');

// constants
const MAX_RELATIVE_SECONDS = 60*60*24*30;


/**
 * A record to store in memory. Params:
 *	- value: the value to store.
 *	- expirationSeconds: the number of seconds that the item must live, at most.
 *	- flags: to store with the value.
 */
class Record {
	constructor(value, expirationSeconds, flags)
	{
		this.flags = flags;
		this.expiration = 0;
		this.value = value;
		if (expirationSeconds)
		{
			if (expirationSeconds < MAX_RELATIVE_SECONDS)
			{
				this.expiration = Date.now() + 1000 * expirationSeconds;
			}
			else
			{
				this.expiration = 1000 * expirationSeconds;
			}
		}
	}

	/**
	 * Find out if the record is still valid.
	 */
	isValid()
	{
		if (!this.expiration)
		{
			return true;
		}
		log.debug('Now: %s, expiration: %s', Date.now(), this.expiration);
		return (Date.now() < this.expiration);
	}
}

/**
 * An in-memory cache object.
 * Options can be an integer defining the size of the cache in items.
 * Otherwise it is an object that may hold:
 *	- maxSizeMb: max size of the cache in MB.
 * Compatible with jscache API: https://github.com/monsur/jscache.
 */
class Cache {
	constructor(options = {})
	{
		this.records = {};
		this.maxRecords = parseInt(options.maxRecords) || 0;
		this.maxSizeMb = options.maxSizeMb || 0
		this.totalItems = 0;
		this.port = options.port || 0
	}

	/**
	 * Find out if the cache contains the given key.
	 */
	contains(key)
	{
		if (!(key in this.records))
		{
			return false;
		}
		const record = this.records[key];
		if (!record.isValid())
		{
			return false;
		}
		return true;
	}

	/**
	 * Get a value from the cache. Params:
	 *	- key: the key to look up.
	 * Returns the current value, or null if not in the cache.
	 */
	get(key)
	{
		if (!this.contains(key))
		{
			return null;
		}
		return this.records[key].value;
	}

	/**
	 * Get multiple values from the cache. Params:
	 *	- keys: an array of keys.
	 *	Returns a map with the current value for each key, if present.
	 */
	getMulti(keys)
	{
		const result = {};
		keys.forEach(function(key)
		{
			if (this.contains(key))
			{
				result[key] = this.records[key].value;
			}
		});
		return result;
	}

	/**
	 * Set a record in the cache. Params:
	 *	- key: the key to look up.
	 *	- value: to store.
	 *	- expirationSeconds: time to live, or 0 for unlimited.
	 *	- flags: for the value.
	 * Returns true if the item was stored.
	 */
	set(key, value, expirationSeconds, flags)
	{
		const record = new Record(value, expirationSeconds, flags);
		this.records[key] = record;
		this.totalItems++;
		process.nextTick(() => this.purge());
		return true;
	}

	/**
	 * Add a record to the cache, only if it is not present. Params equal to set().
	 */
	add(key)
	{
		if (this.contains(key))
		{
			return false;
		}
		return this.set.apply(this, arguments);
	}

	/**
	 * Replace a record in the cache, only if already present. Params equal to set().
	 */
	replace(key)
	{
		if (!this.contains(key))
		{
			return false;
		}
		return this.set.apply(this, arguments);
	}

	/**
	 * Append to a record in the cache, only if already present. Params equal to set().
	 * Expiration seconds and flags ignored.
	 */
	append(key, value)
	{
		return this.getStringRecord(key, function(record)
		{
			record.value += value;
		});
	}

	/**
	 * Append to a record in the cache, only if already present. Params equal to set().
	 * Expiration seconds and flags ignored.
	 */
	prepend(key, value)
	{
		return this.getStringRecord(key, function(record)
		{
			record.value = value + record.value;
		});
	}

	/**
	 * Get the record with the value as a string.
	 */
	getStringRecord(key, modify)
	{
		if (!this.contains(key))
		{
			return false;
		}
		const record = this.records[key];
		if (typeof record.value != 'string')
		{
			record.value = JSON.stringify(record.value);
		}
		modify(record);
		return true;
	}

	/**
	 * Delete a record from the cache. Params:
	 *	- key: the key to look up.
	 * Returns true if the item was deleted, false if not in the cache.
	 */
	delete(key)
	{
		if (!this.contains(key))
		{
			return false;
		}
		delete this.records[key];
		process.nextTick(() => this.purge());
		return true;
	}

	/**
	 * Increment a key with a value. Only valid for numbers. Params:
	 *	- key: the key to look up.
	 * Returns false if not found, new value otherwise.
	 */
	incr(key, value)
	{
		if (!this.contains(key))
		{
			return false;
		}
		const record = this.records[key];
		if (!prototypes.isNumber(record.value))
		{
			throw new Error('cannot increment or decrement non-numeric value');
		}
		const original = parseInt(record.value, 10);
		let result = original + value;
		if (result < 0)
		{
			result = 0;
		}
		record.value = result;
		return record.value;
	}

	/**
	 * Decrement a key with a value. Only valid for numbers. Params:
	 *	- key: the key to look up.
	 * Returns false if not found, new value otherwise.
	 */
	decr(key, value)
	{
		return this.incr(key, -value);
	}


	/**
	 * Change the expiration seconds of a record. Params:
	 *	- key: the key to look up.
	 *	- expirationSeconds: time to live, or 0 for unlimited.
	 */
	touch(key, expirationSeconds)
	{
		if (!this.contains(key))
		{
			return false;
		}
		const record = this.records[key];
		log.debug('touching: %j', record);
		record.expirationSeconds = expirationSeconds;
		process.nextTick(() => this.purge());
		return true;
	}

	/**
	 * Return an object with stats. Params:
	 *	- type: of stats wanted, ignored by now.
	 */
	stats(type)
	{
		if (type)
		{
			log.error('Unsupported stats type %s', type);
		}
		return {
			pid: process.pid,
			uptime: process.uptime(),
			time: Math.floor(Date.now() / 1000),
			version: this.version(),
			curr_items: this.records.countProperties(),
			total_items: this.totalItems,
			bytes: process.memoryUsage().rss,
			max_bytes: this.maxSizeMb * 1024 * 1024,
			tcpport: this.port,
			num_threads: 1,
			cas_enabled: 'no',
			evictions: 'on',
		};
	}

	/**
	 * Flush all items.
	 */
	flush()
	{
		this.records = {};
		log.notice('All items flushed');
		return true;
	}

	/**
	 * Flush all after an optional expiration in seconds.
	 */
	flush_all(expiration)
	{
		setTimeout(this.flush, expiration * 1000);
		return true;
	}

	/**
	 * Return the current version string.
	 */
	version()
	{
		return packageJson.name + '-' + packageJson.version;
	}

	/**
	 * Set verbosity level. Not implemented.
	 */
	verbosity()
	{
		return true;
	}

	/**
	 * Get a complete record from the cache. Params:
	 *	- key: the key to look up.
	 * Returns the current record (with flags, expiration and value), or null if not in the cache.
	 * Warning: returns even expired records, use with care.
	 */
	getRecord(key)
	{
		return this.records[key];
	}

	/**
	 * Get item directly. Params:
	 *	- key: the key to look up.
	 * Part of jscache API.
	 */
	getItem(key)
	{
		if (!this.contains(key))
		{
			return null;
		}
		return this.records[key].value;
	}

	/**
	 * Set an item directly. Params:
	 *	- key: the key to look up.
	 *	- value: to set.
	 *	- itemOptions: may contain:
	 *		- expirationAbsolute: the time to expire.
	 *		- expirationSeconds: seconds to expire.
	 * Part of jscache API.
	 */
	setItem(key, value, itemOptions)
	{
		let lifetime = 0;
		if (itemOptions)
		{
			if (itemOptions.expirationSeconds)
			{
				lifetime = itemOptions.expirationSeconds;
			}
			if (itemOptions.expirationAbsolute)
			{
				lifetime = (Date.now() - itemOptions.expirationAbsolute.getTime()) / 1000;
			}
		}
		log.debug('storing: %j', value);
		this.set(key, value, lifetime, 0);
	}

	/**
	 * Remove an item. Params:
	 *	- key: the key to look up.
	 * Part of jscache API.
	 */
	removeItem(key)
	{
		return this.delete(key);
	}

	/**
	 * Get how many items are stored.
	 * Part of jscache API.
	 */
	size()
	{
		return this.records.countProperties();
	}

	/**
	 * Purge memory, if needed.
	 */
	purge()
	{
		if (this.maxRecords)
		{
			this.purgeRecords()
		}
		if (this.maxSizeMb)
		{
			this.purgeMemory()
		}
	}

	purgeRecords()
	{
		if (this.records.countProperties() < this.maxRecords)
		{
			return;
		}
		for (const key in this.records)
		{
			delete this.records[key];
			if (this.records.countProperties() < this.maxRecords)
			{
				return;
			}
		}
	}

	purgeMemory()
	{
		const usageMb = process.memoryUsage().rss / 1024 / 1024;
		if (usageMb < this.maxSizeMb)
		{
			return;
		}
		log.info('Memory used %s, max %s: purging', usageMb, this.maxSizeMb);
		for (const key in this.records)
		{
			if (!this.records[key].isValid())
			{
				delete this.records[key];
			}
		}
		if (usageMb < this.maxSizeMb)
		{
			return;
		}
		for (const key in this.records)
		{
			delete this.records[key];
			if (usageMb < this.maxSizeMb)
			{
				return;
			}
		}
	}
}

module.exports = {Record, Cache}

