winston-azure-application-insights
==================================

[![Build Status](https://semaphoreci.com/api/v1/willmorgan/winston-azure-application-insights/branches/develop/shields_badge.svg)](https://semaphoreci.com/willmorgan/winston-azure-application-insights)

An [Azure Application Insights][0] transport for [Winston][1] logging library.

This transport is designed to make it easy to obtain a reference to a standard logging library that broadcasts to Application Insights.

Your logging interface can remain familiar to standard (`logger.info`, `logger.error` etc) without intertwining any Azure-specific implementation detail. 

This library intends to be compatible with `applicationinsights` `1.0` and Winston `3.x`. If you are using older versions of these libraries, see the `1.x` releases.

It works best with `applicationinsights@~1.0.6` due to improved trace property handling.

**[Read the project changelog](./CHANGELOG.md)**  

## Installation

You'll need the following packages as peer dependencies; install and update them in your requiring project:

* the `winston` logger package
* the `applicationinsights` library

```sh
npm install winston-azure-application-insights
```

They aren't required for you, in case you want to run a specific version.

## Support

This library uses ES6 which should be compatible with NodeJS 6 through to 10.

Continuous integration tests are run against the NodeJS LTS versions.

## Usage

See `demo.js` for a small example.

**Instrumentation key**

**Note**: an instrumentation key is required before any data can be sent. Please see the
"[Getting an Application Insights Instrumentation Key](https://github.com/Microsoft/AppInsights-Home/wiki#getting-an-application-insights-instrumentation-key)"
for more information.

The instrumentation key can be supplied in 4 ways:

* Specifying the "key" property in the options of the transport:

```javascript
const { AzureApplicationInsightsLogger } = require('winston-azure-application-insights');


// Create an app insights client with the given key
winston.add(new AzureApplicationInsightsLogger({
    key: "<YOUR_INSTRUMENTATION_KEY_HERE>"
}));
```

* Passing an initialized Application Insights module reference in the "insights" options property (This may be useful
 if you want to configure AI to suit your needs):

```javascript
const appInsights = require("applicationinsights");
const { AzureApplicationInsightsLogger } = require('winston-azure-application-insights');

appInsights.setup("<YOUR_INSTRUMENTATION_KEY_HERE>").start();

// Use an existing app insights SDK instance
winston.add(new AzureApplicationInsightsLogger({
    insights: appInsights
}));
```

* Passing an initialized Application Insights client in the "client" options property:

```javascript
const appInsights = require("applicationinsights");
const { AzureApplicationInsightsLogger } = require('winston-azure-application-insights');

appInsights.setup("<YOUR_INSTRUMENTATION_KEY_HERE>").start();

// Create a new app insights client with another key
winston.add(new AzureApplicationInsightsLogger({
    client: appInsights.getClient("<ANOTHER_INSTRUMENTATION_KEY_HERE>")
}));
```

* Setting the `APPINSIGHTS_INSTRUMENTATIONKEY` environment variable (supported by the Application Insights SDK)

**I get an error when using this transport**

If you receive the error:

"Instrumentation key not found, pass the key in the config to this method or set the key in the environment variable APPINSIGHTS_INSTRUMENTATIONKEY before starting the server"

Then you didn't specify a suitable instrumentation key. See the section above.

**I get an error "Zones already loaded"**

This may be because your environment has already (maybe implicitly) loaded applicationinsights and called `.setup()`.
This happens if you are running an Azure Function App and have `APPINSIGHTS_INSTRUMENTATIONKEY` set.
The best solution to this is to load `applicationinsights` and pass in `appInsights.defaultClient` using the `client`
option as per example 3.

**I'm seeing multiple traces with similar/identical messages**

`applicationinsights` deeply integrates into the `console` transports, and `winston` itself (via `diagnostic-channel`).
If you are integrating this transport, it's recommended to disable `diagnostic-channel` and console auto collection:

To control `diagnostic-channel`, [follow the guide in the main repository](https://github.com/Microsoft/ApplicationInsights-node.js#automatic-third-party-instrumentation).
Note that better control is afforded in versions from `1.0.5`.

It is recommended to use _only_ this transport where your application is running in production mode and needs to
stream data to Application Insights. In all other scenarios such as local debug and test suites, the console transport
(or similar) should suffice. This is to avoid polluting instances/unnecessary cost.

Despite this notice, to specifically disable console transport collection, use `.setAutoCollectConsole(false)`:

```js
const appInsights = require('applicationinsights');
appInsights.setup(process.env.APPINSIGHTS_INSTRUMENTATIONKEY)
    .setAutoCollectConsole(false);
```

## Options

* **level**: lowest logging level transport to be logged (default: `info`)
* **sendErrorsAsExceptions**: Boolean flag indicating whether to also track errors to the AI exceptions table.
See section below for more details (default: `true`).

**SDK integration options (required):**

Ony one of the above option parameters will be used, in this order: client, insights, key.

* **client**: An existing App Insights client
* **insights**: An App Insights SDK instance (needs to be already started)
* **key**: App Insights instrumentation key. An instance of the SDK will be initialized and started using this key. In lieu of this setting, you can set the environment variable: `APPINSIGHTS_INSTRUMENTATIONKEY`

## Log Levels

Supported log levels are:

Winston Level | App Insights level
---------------|------------------
emerg          | critical (4)
alert          | critical (4)
crit           | critical (4)
error          | error (3)
warning        | warning (2)
warn           | warning (2)
notice         | informational (1)
info           | informational (1)
verbose        | verbose (0)
debug          | verbose (0)
silly          | verbose (0)

**All other possible levels, or custom levels, will default to `info`**

[0]: https://azure.microsoft.com/en-us/services/application-insights/
[1]: https://github.com/flatiron/winston
[2]: https://github.com/Microsoft/ApplicationInsights-node.js/tree/1.0.1#migrating-from-versions-prior-to-022

## Error & Exception Logging: Exceptions vs. Traces

The Application Insights "exceptions" table allows you to see more detailed error information including the stack trace.
Therefore for all log events at severity level error or above, an exception is logged if the library detects that an
Error object has been passed.
The log event will still generate a trace with the correct severity level regardless of this setting, but please note
that any Error object will have its `stack` property omitted when sent to `trackTrace`.
All other properties are included.

This allows you to see clearly Azure Application Insights instead of having to access trace information manually and set
up alerts based on the related metrics.

How it works with `sendErrorsAsExceptions: true`:

* `logger.error('error message');` creates a trace with severity level 3; *no* exception is tracked
* `logger.error(new Error('error message'));` creates a trace with severity level 3, *and* an exception with the Error object as argument
* `logger.error('error message', new Error('error message'));` creates a trace with severity level 3, *and* an exception with the Error object as argument
* `logger.error(new Error('error message'), logContext);` creates a trace and exception and logContext is set to the customDimensions (properties) track* field
* `logger.info(new Error('error message'));` creates a trace with severity level 1; *no* exception is tracked

If you do not wish to track exceptions, you can set the option `sendErrorsAsExceptions: false` when configuring the transport.
