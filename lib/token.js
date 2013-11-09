'use strict';

/**
 * Token generation.
 * (C) 2013 Alex Fernández.
 */

// requires
require('prototypes');
var Log = require('log');
var crypto = require('crypto');
var testing = require('testing');

// globals
var log = new Log('info');
// log = new Log('debug');

// constants
var SHORT_LENGTH = 4;


/**
 * Create a random token, for tests.
 * It is a pseudo-random value so don't use for anything sensitive.
 */
exports.create = function()
{
	var bytes;
	try
	{
		bytes = crypto.pseudoRandomBytes(SHORT_LENGTH);
		log.debug('Generated %d bytes of random data', bytes.length);
	}
	catch (exception)
	{
		log.error('Could not generate random bytes: %s', exception);
		return '0123456789';
	}
	var random = Math.abs(intFromBytes(bytes));
	log.debug('Integer: %s', random);
	return random.toString(36);
};

/**
 * Generate an int from an array of bytes.
 */
function intFromBytes(bytes)
{
	var val = 0;
	for (var i = 0; i < bytes.length; ++i)
	{
		val += bytes[i];
		if (i < bytes.length - 1)
		{
			val = val << 8;
		}
	}
	return val;
}

/**
 * Test basic randomicity of tokens.
 */
function testToken(callback)
{
	var frequencies = {};
	var characters = '0123456789abcdefghijklmnopqrstuvwxyz';
	var c;
	for (var i = 0; i < characters.length; i++)
	{
		c = characters[i];
		frequencies[c] = 0;
	}
	var TRIALS = 100000;
	var totalLength = 0;
	for (var trial = 0; trial < TRIALS; trial++)
	{
		var random = exports.create();
		log.debug('Generated: %s', random);
		totalLength += random.length;
		for (i = 0; i < random.length; i++)
		{
			c = random[i];
			testing.assert(c in frequencies, 'Character ' + c + ' not in frequencies', callback);
			frequencies[c] += 1;
		}
	}
	log.debug('Trials: %s, total length: %s', TRIALS, totalLength);
	var expectedFrequency = totalLength / characters.length;
	var expectedDeviation = 4 * Math.sqrt(expectedFrequency);
	// do not count 0 or z
	delete frequencies['0'];
	delete frequencies.z;
	for (c in frequencies)
	{
		var deviation = Math.abs(expectedFrequency - frequencies[c]);
		log.debug('Frequency for %s: %s, deviation: %s', c, frequencies[c], deviation);
		testing.assert(deviation < expectedDeviation, 'Deviation for ' + c + ' is too high: ' + deviation + ' > ' + expectedDeviation, callback);
	}
	testing.success(callback);
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	testing.run({
		token: testToken,
	}, callback);
};

// start if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

