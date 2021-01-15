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
    return obj instanceof Error;
}


/**
 * Account for Winston 3.x log formatters adding properties to the log info object.
 * This just takes all properties (excluding Symbols, level, message) and returns a starter object
 * for trace properties, which make it into customDimensions.
 * @param info
 * @returns {{}}
 */
function extractPropsFromInfo(info) {
    const exclude = ['level', 'message'];
    return Object.keys(info)
        .filter((key) => !exclude.includes(key))
        .reduce((props, key) => Object.assign(props, { [key]: info[key] }), {});
}

/**
 * Errors don't have enumerable keys, so include all except the stack:
 * we don't want stacks inside the trace table
 * @param {*} errorLike
 * @returns {{message}}
 */
function extractErrorPropsForTrace(errorLike) {
    const properties = {
        message: errorLike.message,
    };
    for (let key in errorLike) { // eslint-disable-line no-restricted-syntax
        if (key !== 'stack' && Object.prototype.hasOwnProperty.call(errorLike, key)) {
            properties[key] = errorLike[key];
        }
    }
    return properties;
}

class AzureApplicationInsightsLogger extends Transport {
    constructor(userOptions = {}) {
        const options = Object.assign({
            sendErrorsAsExceptions: true,
        }, userOptions);

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
        this.sendErrorsAsExceptions = !!options.sendErrorsAsExceptions;
    }

    handleTrace(severity, info, message, logMeta) {
        const traceProps = extractPropsFromInfo(info);
        let errorArg;
        if (isErrorLike(info)) {
            errorArg = info;
        } else if (isErrorLike(message)) {
            errorArg = message;
        } else if (isErrorLike(logMeta)) {
            errorArg = logMeta;
        }
        if (errorArg) {
            // If info, message or logMeta is an error, trim it and set the properties:
            Object.assign(traceProps, extractErrorPropsForTrace(errorArg));
        }
        if (logMeta !== errorArg) {
            // If we have some log context, set the properties:
            Object.assign(traceProps, logMeta);
        }

        this.client.trackTrace({
            message: String(message),
            severity: severity,
            properties: traceProps,
        });
    }

    /**
     * Send trackException if info, message or logMeta is an Error. Otherwise, return early.
     * @param info
     * @param message
     * @param logMeta
     */
    handleException(info, message, logMeta) {
        const exceptionProps = {};
        let exception;
        if (isErrorLike(info)) {
            exception = info;
        } else if (isErrorLike(message)) {
            exception = message;
        } else if (isErrorLike(logMeta)) {
            exception = logMeta;
        } else {
            return;
        }
        // If a custom message is sent accompanying the exception, set it inside properties:
        if (typeof message === 'string' && exception.message !== message) {
            exceptionProps.message = message;
        }
        // If log context is sent with the error then set those inside properties:
        if (exception !== logMeta) {
            Object.assign(exceptionProps, logMeta);
        }
        this.client.trackException({
            exception,
            properties: exceptionProps,
        });
    }

    log(info, callback) {
        const { level, message } = info;
        const severity = getMessageLevel(level);
        const splat = info[Symbol.for('splat')] || [];
        const logMeta = splat.length ? splat[0] : {};

        this.handleTrace(severity, info, message, logMeta);

        if (this.sendErrorsAsExceptions && severity >= getMessageLevel('error')) {
            this.handleException(info, message, logMeta);
        }

        return callback(null, true);
    }
}

exports.AzureApplicationInsightsLogger = AzureApplicationInsightsLogger;
