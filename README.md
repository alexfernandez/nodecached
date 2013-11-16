[![Build Status](https://secure.travis-ci.org/alexfernandez/nodecached.png)](http://travis-ci.org/alexfernandez/nodecached)

# nodecached

nodecached is a memcached-compatible server and client written in node.js

## Installation

Installing the package is very simple. Just install globally using npm:

    # npm install -g nodecached

On Ubuntu or Mac OS X systems, use `sudo`:

    $ sudo npm install -g nodecached

## nodecached Server

nodecached is primarily a server compatible with memcached.

### Usage

Start from the command line:

    $ nodecached

### Options

Options are designed to be compatible with memcached, whenever possible.

* `-p port`: Start server on the given port.
* `-v`: Show notice messages.
* `-vv`: Show info messages.
* `-vvv`: Show debug messages.

### Advanced Options

These options are specific for nodecached.

* `--error`: Return an error on all queries. Useful for measuring socket performance, without parsing commands.
* `--delay`: Enable Nagle's algorithm. Useful for measuring the cost of not setting the option `nodelay`.

## Memcached Client

nodecached can be used as a client to a remote system.
It has been designed to be a drop-in replacement for
[node-memcached](https://github.com/3rd-Eden/node-memcached).

### Usage

You can integrate nodecached into your code as a client.

### Options

The client accepts some options compatible with node-memcached.

## In-memory Cache

nodecached can also work as an in-memory cache, again compatible with
[node-memcached](https://github.com/3rd-Eden/node-memcached).

## License

Distributed under the MIT license. See the file LICENSE for details.

