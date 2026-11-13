import { defineEventa } from "@moeru/eventa";
//#region src/types/events.ts
function defineProtocolEventa(id, options) {
	return defineEventa(id, options);
}
let MessageHeartbeatKind = /* @__PURE__ */ function(MessageHeartbeatKind) {
	MessageHeartbeatKind["Ping"] = "ping";
	MessageHeartbeatKind["Pong"] = "pong";
	return MessageHeartbeatKind;
}({});
let MessageHeartbeat = /* @__PURE__ */ function(MessageHeartbeat) {
	MessageHeartbeat["Ping"] = "🩵";
	MessageHeartbeat["Pong"] = "💛";
	return MessageHeartbeat;
}({});
let WebSocketEventSource = /* @__PURE__ */ function(WebSocketEventSource) {
	WebSocketEventSource["Server"] = "proj-airi:server-runtime";
	WebSocketEventSource["StageWeb"] = "proj-airi:stage-web";
	WebSocketEventSource["StageTamagotchi"] = "proj-airi:stage-tamagotchi";
	return WebSocketEventSource;
}({});
let ContextUpdateStrategy = /* @__PURE__ */ function(ContextUpdateStrategy) {
	ContextUpdateStrategy["ReplaceSelf"] = "replace-self";
	ContextUpdateStrategy["AppendSelf"] = "append-self";
	return ContextUpdateStrategy;
}({});
/**
* Chat messages hold `airi-asset:<id>` in place of image and audio bytes, for example in `output:gen-ai:chat:message`.
* A module reads the bytes with `asset:get:request`.
*/
const ASSET_REF_PREFIX = "airi-asset:";
const peerAuthenticate = defineEventa("peer:authenticate");
const peerAuthenticated = defineEventa("peer:authenticated");
const peerStatus = defineEventa("peer:status");
const peerDeAuthenticated = defineEventa("peer:de-authenticated");
const extensionAuthenticate = defineEventa("extension:authenticate");
const extensionAuthenticated = defineEventa("extension:authenticated");
const extensionAnnounce = defineEventa("extension:announce");
const extensionAnnounced = defineEventa("extension:announced");
const extensionDeAnnounced = defineEventa("extension:de-announced");
const extensionModuleAnnounce = defineEventa("extension:module:announce");
const extensionModuleAnnounced = defineEventa("extension:module:announced");
const extensionModuleDeAnnounced = defineEventa("extension:module:de-announced");
const extensionKitAnnounce = defineEventa("extension:kit:announce");
const extensionKitAnnounced = defineEventa("extension:kit:announced");
const extensionKitDeAnnounced = defineEventa("extension:kit:de-announced");
const moduleAuthenticate = defineEventa("module:authenticate");
const moduleAuthenticated = defineEventa("module:authenticated");
const moduleCompatibilityRequest = defineEventa("module:compatibility:request");
const moduleCompatibilityResult = defineEventa("module:compatibility:result");
const registryModulesSync = defineEventa("registry:modules:sync");
const registryModulesHealthUnhealthy = defineEventa("registry:modules:health:unhealthy");
const registryModulesHealthHealthy = defineEventa("registry:modules:health:healthy");
const error = defineEventa("error");
/** Permission-check failure event. See `ModulePermissionError`. */
const errorPermission = defineEventa("error:permission");
const moduleAnnounce = defineEventa("module:announce");
const moduleAnnounced = defineEventa("module:announced");
const moduleDeAnnounced = defineEventa("module:de-announced");
/** Permission declaration lifecycle event. See `ModulePermissionsDeclareEvent`. */
const modulePermissionsDeclare = defineEventa("module:permissions:declare");
/** Permission request lifecycle event. See `ModulePermissionsRequestEvent`. */
const modulePermissionsRequest = defineEventa("module:permissions:request");
/** Permission grant lifecycle event. See `ModulePermissionsGrantedEvent`. */
const modulePermissionsGranted = defineEventa("module:permissions:granted");
/** Permission denial lifecycle event. See `ModulePermissionsDeniedEvent`. */
const modulePermissionsDenied = defineEventa("module:permissions:denied");
/** Current permission snapshot event. See `ModulePermissionsCurrentEvent`. */
const modulePermissionsCurrent = defineEventa("module:permissions:current");
const modulePrepared = defineEventa("module:prepared");
const moduleConfigurationNeeded = defineEventa("module:configuration:needed");
const moduleStatus = defineEventa("module:status");
const moduleConfigurationValidateRequest = defineEventa("module:configuration:validate:request");
const moduleConfigurationValidateResponse = defineEventa("module:configuration:validate:response");
const moduleConfigurationValidateStatus = defineEventa("module:configuration:validate:status");
const moduleConfigurationPlanRequest = defineEventa("module:configuration:plan:request");
const moduleConfigurationPlanResponse = defineEventa("module:configuration:plan:response");
const moduleConfigurationPlanStatus = defineEventa("module:configuration:plan:status");
const moduleConfigurationCommit = defineEventa("module:configuration:commit");
const moduleConfigurationCommitStatus = defineEventa("module:configuration:commit:status");
const moduleConfigurationConfigured = defineEventa("module:configuration:configured");
const moduleContributeCapabilityOffer = defineEventa("module:contribute:capability:offer");
const moduleContributeCapabilityConfigurationNeeded = defineEventa("module:contribute:capability:configuration:needed");
const moduleContributeCapabilityConfigurationValidateRequest = defineEventa("module:contribute:capability:configuration:validate:request");
const moduleContributeCapabilityConfigurationValidateResponse = defineEventa("module:contribute:capability:configuration:validate:response");
const moduleContributeCapabilityConfigurationValidateStatus = defineEventa("module:contribute:capability:configuration:validate:status");
const moduleContributeCapabilityConfigurationPlanRequest = defineEventa("module:contribute:capability:configuration:plan:request");
const moduleContributeCapabilityConfigurationPlanResponse = defineEventa("module:contribute:capability:configuration:plan:response");
const moduleContributeCapabilityConfigurationPlanStatus = defineEventa("module:contribute:capability:configuration:plan:status");
const moduleContributeCapabilityConfigurationCommit = defineEventa("module:contribute:capability:configuration:commit");
const moduleContributeCapabilityConfigurationCommitStatus = defineEventa("module:contribute:capability:configuration:commit:status");
const moduleContributeCapabilityConfigurationConfigured = defineEventa("module:contribute:capability:configuration:configured");
const moduleContributeCapabilityActivated = defineEventa("module:contribute:capability:activated");
const moduleStatusChange = defineProtocolEventa("module:status:change");
const moduleConfigure = defineProtocolEventa("module:configure");
const moduleConsumerRegister = defineProtocolEventa("module:consumer:register");
const moduleConsumerUnregister = defineProtocolEventa("module:consumer:unregister");
const uiConfigure = defineProtocolEventa("ui:configure");
const inputText = defineProtocolEventa("input:text", { metadata: { delivery: {
	mode: "consumer-group",
	group: "chat-ingestion",
	selection: "first"
} } });
const inputTextVoice = defineProtocolEventa("input:text:voice", { metadata: { delivery: {
	mode: "consumer-group",
	group: "chat-ingestion",
	selection: "first"
} } });
const inputVoice = defineProtocolEventa("input:voice", { metadata: { delivery: {
	mode: "consumer-group",
	group: "chat-ingestion",
	selection: "first"
} } });
const outputGenAiChatToolCall = defineProtocolEventa("output:gen-ai:chat:tool-call");
const outputGenAiChatMessage = defineProtocolEventa("output:gen-ai:chat:message");
const outputGenAiChatComplete = defineProtocolEventa("output:gen-ai:chat:complete");
const assetGetRequest = defineProtocolEventa("asset:get:request");
const assetGetResponse = defineProtocolEventa("asset:get:response");
const sparkNotify = defineProtocolEventa("spark:notify");
const sparkEmit = defineProtocolEventa("spark:emit");
const sparkCommand = defineProtocolEventa("spark:command");
const transportConnectionHeartbeat = defineProtocolEventa("transport:connection:heartbeat");
const contextUpdate = defineProtocolEventa("context:update");
const protocolEventMetadataByType = {
	[inputText.id]: inputText.metadata,
	[inputTextVoice.id]: inputTextVoice.metadata,
	[inputVoice.id]: inputVoice.metadata
};
function getProtocolEventMetadata(eventType) {
	return protocolEventMetadataByType[eventType];
}
//#endregion
export { ASSET_REF_PREFIX, ContextUpdateStrategy, MessageHeartbeat, MessageHeartbeatKind, WebSocketEventSource, assetGetRequest, assetGetResponse, contextUpdate, error, errorPermission, extensionAnnounce, extensionAnnounced, extensionAuthenticate, extensionAuthenticated, extensionDeAnnounced, extensionKitAnnounce, extensionKitAnnounced, extensionKitDeAnnounced, extensionModuleAnnounce, extensionModuleAnnounced, extensionModuleDeAnnounced, getProtocolEventMetadata, inputText, inputTextVoice, inputVoice, moduleAnnounce, moduleAnnounced, moduleAuthenticate, moduleAuthenticated, moduleCompatibilityRequest, moduleCompatibilityResult, moduleConfigurationCommit, moduleConfigurationCommitStatus, moduleConfigurationConfigured, moduleConfigurationNeeded, moduleConfigurationPlanRequest, moduleConfigurationPlanResponse, moduleConfigurationPlanStatus, moduleConfigurationValidateRequest, moduleConfigurationValidateResponse, moduleConfigurationValidateStatus, moduleConfigure, moduleConsumerRegister, moduleConsumerUnregister, moduleContributeCapabilityActivated, moduleContributeCapabilityConfigurationCommit, moduleContributeCapabilityConfigurationCommitStatus, moduleContributeCapabilityConfigurationConfigured, moduleContributeCapabilityConfigurationNeeded, moduleContributeCapabilityConfigurationPlanRequest, moduleContributeCapabilityConfigurationPlanResponse, moduleContributeCapabilityConfigurationPlanStatus, moduleContributeCapabilityConfigurationValidateRequest, moduleContributeCapabilityConfigurationValidateResponse, moduleContributeCapabilityConfigurationValidateStatus, moduleContributeCapabilityOffer, moduleDeAnnounced, modulePermissionsCurrent, modulePermissionsDeclare, modulePermissionsDenied, modulePermissionsGranted, modulePermissionsRequest, modulePrepared, moduleStatus, moduleStatusChange, outputGenAiChatComplete, outputGenAiChatMessage, outputGenAiChatToolCall, peerAuthenticate, peerAuthenticated, peerDeAuthenticated, peerStatus, protocolEventMetadataByType, registryModulesHealthHealthy, registryModulesHealthUnhealthy, registryModulesSync, sparkCommand, sparkEmit, sparkNotify, transportConnectionHeartbeat, uiConfigure };

//# sourceMappingURL=index.mjs.map