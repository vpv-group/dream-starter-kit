/**
 * @acme/mod-feedback — client barrel (validators, shared vocabulary, data
 * queries, react-query hooks). Client-safe for web AND native (Metro sees
 * this entry); server code lives in ./server, ./payload and ./web-server.
 */
export * from "./shared/config";
export * from "./shared/tones";
export * from "./validators";
export * from "./data";
export * from "./hooks/use-feedback";
