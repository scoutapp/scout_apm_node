# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.11-rc.1] - 2020-06-26

### Changed
- bugfix/221 Fix setup being repeatedly performed during initial requests ([#221](https://github.com/scoutapp/scout_apm_node/issues/221))

## [0.1.11-rc.0] - 2020-06-25

### Changed
- bugfix/219 Timed out requests cause errors during context addition ([#219](https://github.com/scoutapp/scout_apm_node/issues/219))
- bugfix/214 Better documentation around integrations, waiting for setup ([#214](https://github.com/scoutapp/scout_apm_node/issues/214))

## [0.1.10] - 2020-06-23

### Changed
-  See `v0.1.10-rc.0` -> `v0.1.10-rc.2` changes

## [0.1.10-rc.2] - 2020-06-19

### Changed
- HOTFIX: support for externally located `node_modules` folders during library resolution ([PR](https://github.com/scoutapp/scout_apm_node/pull/215))

## [0.1.10-rc.1] - 2020-06-18

### Added
- feature/209 Add HTTPS integration and tests ([#209](https://github.com/scoutapp/scout_apm_node/issues/209))

### Changed
- bugfix/201 Lazy initial load of global scout during express request ([#201](https://github.com/scoutapp/scout_apm_node/issues/201))
- bugfix/202 Fix package.json resolution for libraries in ApplicationMetadata ([#202](https://github.com/scoutapp/scout_apm_node/issues/202))
- bugfix/183 Fix URL building ([#183](https://github.com/scoutapp/scout_apm_node/issues/183))

## [0.1.10-rc.0] - 2020-06-15

### Added
- bugfix/200 investigate nuxt failure (adds preliminary nuxt support) ([#200](https://github.com/scoutapp/scout_apm_node/issues/200))

## [0.1.9] - 2020-05-31

### Changed
- HOTFIX: Fix http integration when instrumetation is not present
- bugfix/196 Allow upper and lower case log levels ([#196](https://github.com/scoutapp/scout_apm_node/issues/196))

## [0.1.9-rc.0] - 2020-04-28

### Changed
- bugfix/187 Avoid failing on windows ([#187](https://github.com/scoutapp/scout_apm_node/issues/187))
- bugfix/186 Create transaction if one does not exist ([#186](https://github.com/scoutapp/scout_apm_node/issues/186))
- bugfix/191 Sequelize integration failure due to postgres integration ([#191](https://github.com/scoutapp/scout_apm_node/issues/191))
- bugfix/190 dependabot Update js-yaml from 3.12.2 to 3.13.1 ([#190](https://github.com/scoutapp/scout_apm_node/issues/190))

## [0.1.8] - 2020-03-11

### Added
- feature/174 bump core agent versiont 1.2.8 ([#174](https://github.com/scoutapp/scout_apm_node/issues/174))
- feature/169 detect application root ([#169](https://github.com/scoutapp/scout_apm_node/issues/169))

### Changed
- bugfix/171 Ensure addContext takes name + value everywhere ([#171](https://github.com/scoutapp/scout_apm_node/issues/171))
- bugfix/172 backtraces do not contain useful frames ([#172](https://github.com/scoutapp/scout_apm_node/issues/172))
- bugfix/170 agent does not reconnect ([#170](https://github.com/scoutapp/scout_apm_node/issues/170))

## [0.1.7] - 2020-03-02

### Changed
- bugfix: Fix incorrect argument to handler in express integration ([#166](https://github.com/scoutapp/scout_apm_node/issues/166))

## [0.1.6] - 2020-02-28

### Changed
- bugfix: Fix Template/Render span not being passed to core-agent ([#162](https://github.com/scoutapp/scout_apm_node/issues/162))
- bugfix: Fix unreachable core agent exception ([#161](https://github.com/scoutapp/scout_apm_node/issues/161))

## [0.1.5] - 2020-02-25

### Changed
- bugfix: Fix missing express properties ([#157](https://github.com/scoutapp/scout_apm_node/issues/157))

## [0.1.4] - 2020-02-25

### Changed
- bugfix: export expressMiddleware in scout bundle

## [0.1.3] - 2020-02-25

### Added
- feature: directly ignore transaction ([#148](https://github.com/scoutapp/scout_apm_node/issues/148))
- feature: add ignoring transaction to top level API ([#153](https://github.com/scoutapp/scout_apm_node/issues/153))

### Changed
- bugfix: trim library export ([#149](https://github.com/scoutapp/scout_apm_node/issues/149))
- bugfix: dont send traces for unknown routes ([#151](https://github.com/scoutapp/scout_apm_node/issues/151))

## [0.1.2] - 2020-02-21

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

[Unreleased]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.11-rc.1...HEAD
[0.1.11-rc.1]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.11-rc.0...v0.1.11-rc.1
[0.1.11-rc.0]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.10...v0.1.11-rc.0
[0.1.10]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.10-rc.2...v0.1.10
[0.1.10-rc.2]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.10-rc.1...v0.1.10-rc.2
[0.1.10-rc.1]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.10-rc.0...v0.1.10-rc.1
[0.1.10-rc.0]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.9...v0.1.10-rc.0
[0.1.9]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.9-rc.0...v0.1.9
[0.1.9-rc.0]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.8...v0.1.9-rc.0
[0.1.8]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/scoutapp/scout_apm_node/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/scoutapp/scout_apm_node/releases/tag/v0.1.0
