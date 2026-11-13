import { n as defineInvokeEventa } from "./node_modules/.pnpm/@moeru_eventa@1.0.2_electron@43.8.4_supports-color@10.2.2__h3@2.0.8_crossws@0.4.17_srvx_30e3f9b6adb3c076e6c085d80bc14293/node_modules/@moeru/eventa/dist/invoke-shared-DIUqKwUl.js";
//#region src/index.ts
const screenCaptureGetSources = defineInvokeEventa("eventa:invoke:electron:screen-capture:get-sources");
const screenCaptureSetSourceEx = defineInvokeEventa("eventa:invoke:electron:screen-capture:set-source");
const screenCaptureResetSource = defineInvokeEventa("eventa:invoke:electron:screen-capture:reset-source");
const screenCaptureCheckMacOSPermission = defineInvokeEventa("eventa:invoke:electron:screen-capture:check-macos-permission");
const screenCaptureRequestMacOSPermission = defineInvokeEventa("eventa:invoke:electron:screen-capture:request-macos-permission");
const screenCapture = {
	getSources: screenCaptureGetSources,
	setSource: screenCaptureSetSourceEx,
	resetSource: screenCaptureResetSource,
	checkMacOSPermission: screenCaptureCheckMacOSPermission,
	requestMacOSPermission: screenCaptureRequestMacOSPermission
};
//#endregion
export { screenCapture, screenCaptureCheckMacOSPermission, screenCaptureGetSources, screenCaptureRequestMacOSPermission, screenCaptureResetSource, screenCaptureSetSourceEx };
