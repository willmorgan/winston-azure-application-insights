'use strict';

const appInsights = require('applicationinsights');
const Transport = require('winston-transport');

const WINSTON_LOGGER_NAME = 'applicationinsightslogger';
const WINSTON_DEFAULT_LEVEL = 'info';

// Remapping the popular levels to Application Insights
function getMessageLevel(winstonLevel) {
    const levels = {
        emerg: appInsights.Contracts.SeverityLevel.Critical,
        alert: appInsights.Contracts.SeverityLevel.Critical,
        crit: appInsights.Contracts.SeverityLevel.Critical,
        error: appInsights.Contracts.SeverityLevel.Error,
        warning: appInsights.Contracts.SeverityLevel.Warning,
        warn: appInsights.Contracts.SeverityLevel.Warning,
        notice: appInsights.Contracts.SeverityLevel.Information,
        info: appInsights.Contracts.SeverityLevel.Information,
        verbose: appInsights.Contracts.SeverityLevel.Verbose,
        debug: appInsights.Contracts.SeverityLevel.Verbose,
        silly: appInsights.Contracts.SeverityLevel.Verbose,
    };

    return winstonLevel in levels ? levels[winstonLevel] : levels.info;
}

exports.getMessageLevel = getMessageLevel;

function isErrorLike(obj) {
    if (obj instanceof Error) {
        return true;
    }
    // App Insights sometimes wraps errors:
    return obj.constructor && obj.constructor.name === 'Error';
}

/**
 * Errors don't have enumerable keys, so try and always return at least a message and stack
 * @param {*} errorLike
 * @returns {{message, stack}}
 */
function extractErrorProps(errorLike) {
    const properties = {
        message: errorLike.message,
        stack: errorLike.stack,
    };
    for (let key in errorLike) { // eslint-disable-line no-restricted-syntax
        if (Object.prototype.hasOwnProperty.call(errorLike, key)) {
            properties[key] = errorLike[key];
        }
    }
    return properties;
}

class AzureApplicationInsightsLogger extends Transport {
    constructor(options = {}) {
        super(options);

        if (options.client) {
            // If client is set, just use it.
            // We expect it to be already configured and started
            this.client = options.client;
        } else if (options.insights) {
            // If insights is set, just use the default client
            // We expect it to be already configured and started
            this.client = options.insights.defaultClient;
        } else {
            // Setup insights and start it
            // If options.key is defined, use it. Else the SDK will expect
            // an environment variable to be set.

            appInsights
                .setup(options.key)
                .start();

            this.client = appInsights.defaultClient;
        }

        if (!this.client) {
            throw new Error('Could not get an Application Insights client instance');
        }

        this.name = WINSTON_LOGGER_NAME;
        this.level = options.level || WINSTON_DEFAULT_LEVEL;
        this.treatErrorsAsExceptions = !!options.treatErrorsAsExceptions;
    }

    log(info, callback) {
        let { level, message } = info;
        const aiLevel = getMessageLevel(level);
        const isErrorLevel = aiLevel >= getMessageLevel('error');
        const splat = info[Symbol.for('splat')] || [];
        let logMeta = {};
        if (splat.length) {
            logMeta = splat[0];
        }

        const traceProps = {};

        if (isErrorLevel && this.treatErrorsAsExceptions) {
            let exception;
            if (isErrorLike(info)) {
                exception = info;
            } else if (isErrorLike(logMeta)) {
                exception = logMeta;
            } else {
                exception = Error(message);
            }
            const errorProps = extractErrorProps(exception);
            Object.assign(traceProps, errorProps);
            if (errorProps.message !== message) {
                traceProps.message = message + ': ' + errorProps.message;
            }
            this.client.trackException({
                exception,
                properties: traceProps,
            });
        } else {
            let errorArg;
            if (isErrorLike(info)) {
                errorArg = info;
            } else if (isErrorLike(logMeta)) {
                errorArg = logMeta;
            }
            if (errorArg) {
                Object.assign(traceProps, extractErrorProps(errorArg));
            } else {
                Object.assign(traceProps, logMeta);
            }

            this.client.trackTrace({
                message: message,
                severity: aiLevel,
                properties: traceProps,
            });
        }

        return callback(null, true);
    }
}

exports.AzureApplicationInsightsLogger = AzureApplicationInsightsLogger;
