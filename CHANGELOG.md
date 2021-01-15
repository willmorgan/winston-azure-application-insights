# 2.0.0

* Supports Winston 3.x (DROPS support for Winston 2.x)
* `silent` flag removed in favour of not configuring the transport
* `winston` and `applicationinsights` packages changed to `peerDependencies`
* Remove `fixNestedObjects` in favour of using the upstream `applicationinsights` libary's bugfix
* Remove `formatter` in favour of using `winston@3.x`'s formatter functionality
* Replace `treatErrorsAsExceptions` with `sendErrorsAsExceptions` following feedback from AI core team w/r best practice error tracking
* Package install size drastically reduced

# 2.0.1

* Allow `log` to take `null` or `undefined` message parameters.