# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.3] - 2020-02-25

### Added
- feature: directly ignore transaction ([#148](https://github.com/scoutapp/scout_apm_node/issues/148))

### Changed
- bugfix: trim library export ([#149](https://github.com/scoutapp/scout_apm_node/issues/149))
- bugfix: dont send traces for unknown routes ([#151](https://github.com/scoutapp/scout_apm_node/issues/151))

## [1.1.2] - 2020-02-21

### Added
- feature: Use addContext for single tags, top level scout.addContext method ([#138](https://github.com/scoutapp/scout_apm_node/issues/138))
- feature: Winston support for log-level inheritance ([#135](https://github.com/scoutapp/scout_apm_node/issues/135)

### Changed
- bugfix: custom socketPath not honored ([#139](https://github.com/scoutapp/scout_apm_node/issues/139)
- bugfix: overlapping span ordering (i.e. sql query + render) ([#140](https://github.com/scoutapp/scout_apm_node/issues/140)

## [0.1.1] - 2020-01-10
### Added
- feature: Modify dashboard send tests to send at the end ([#128](https://github.com/scoutapp/scout_apm_node/issues/128))
- feature: enable express controller exception catching ([#127](https://github.com/scoutapp/scout_apm_node/issues/127))

### Changed
- bugfix: Fix span parent nesting and add test ([#129](https://github.com/scoutapp/scout_apm_node/issues/129))

## [0.1.0] - 2015-10-06
### Added
- Initial implementation of NodeJS agent

[Unreleased]: https://github.com/scoutapp/scout_apm_node/compare/v1.1.3...HEAD
[0.1.3]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/scoutapp/scout_apm_node/releases/tag/v0.1.0
