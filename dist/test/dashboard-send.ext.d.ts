/**
 * The "test"s in this file are made to send to the dashboard.
 * as such, they all take ~2 minutes to run serially, since they wait for attached core-agent(s) to send data
 *
 * These tests should be run either in parallel (via a tool like `bogota`) or by hand
 * and the ENV variable SCOUT_KEY should be provided
 *
 * NOTE - the tests in here do *NOT* properly shut down the scout instances they use right away,
 * cleanup happens at the end after waiting a certain amount of time to ensure the traces are sent.
 */
export {};
