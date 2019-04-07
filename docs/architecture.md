# Architecture #

![Basic architecture image](https://github.com/scoutapp/scout_apm_node/blob/master/docs/architecture.svg)

## Scout Agent (inside your application) ##

The `Scout` object provides a convenient API to the core functionality provided by the `Agent`, along with other utility functionality. The `Scout` agent provides launching (if necessary), coordination and communication with a remote `core-agent` instance (normally, one-per-node).

The Scout Agent works with a couple different objects to accomplish this task:

- `AgentDownloader`s (primarily the `WebAgentDownloader`) for obtaining `core-agent` binaries when necessary
- `Agent` (primarily the `ExternalProcessAgent`) for communicating with a scout `core-agent` instance

## Scout Core Agent (outside your application) ##

The `core-agent` is where the Scout magic happens -- it efficiently communicates with the Scout backend to preserve and report your application level traces.

## Integrations ##

There are various integrations available which provide a very abstracted/specialized API over `Scout`, possibly with different configuration and operation. For example the ExpressJS integration for `Scout` offers a global request-level timeout for requests that occur in an Express application. Requests that pass this threshhold are marked as "timed out" in Scout, but do not affect your application in the case that the request will eventually succeed.
