# Contentful-import
[![npm](https://img.shields.io/npm/v/contentful-import.svg)](https://www.npmjs.com/package/contentful-import)
[![Build Status](https://travis-ci.org/contentful/contentful-import.svg?branch=master)](https://travis-ci.org/contentful/contentful-import)
[![Coverage Status](https://coveralls.io/repos/github/contentful/contentful-import/badge.svg?branch=master)](https://coveralls.io/github/contentful/contentful-import?branch=master)
[![Dependency Status](https://david-dm.org/contentful/contentful-import.svg)](https://david-dm.org/contentful/contentful-import)
[![devDependency Status](https://david-dm.org/contentful/contentful-import/dev-status.svg)](https://david-dm.org/contentful/contentful-import#info=devDependencies)

[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

[Contentful][1] is a content management platform for web applications, mobile apps and connected devices. It allows you to create, edit & manage content in the cloud and publish it anywhere via powerful API. Contentful offers tools for managing editorial teams and enabling cooperation between organizations.

This node module uses the data provided by contentful-export to import it to contentful space

# Changelog

Check out the [releases](https://github.com/contentful/contentful-import/releases) page.

# Install

`npm install -g contentful-export`

# Usage

```shell
Usage: bin/contentful-import [options]

Options:
  --version           Show version number                              [boolean]
  --space-id          ID of the destination space            [string] [required]
  --management-token  Management API token for the destination space
                                                             [string] [required]
  --content-file      json file that contains data to be import to your space
                                                             [string] [required]
  --config            Configuration file with required values
```

# Example usage

```shell
contentful-import \
  --space-id spaceID \
  --management-token managementToken
```

or

```shell
contentful-import --config example-config.json
```

You can create your own config file based on the [`example-config.json`](example-config.json) file.

# Usage as a library

While this tool is mostly intended to be used as a command line tool, it can also be used as a Node library:

```javascript
var spaceImport = require('contentful-import')

spaceImport(options)
.then((output) => {
  console.log('Data Imported successfully')
})
.catch((err) => {
  console.log('oh no! errors occurred!', err)
})
```

[1]: https://www.contentful.com
