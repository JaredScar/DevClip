import type { ClipRow } from '../database/db';
import { getSettingsMap } from '../database/db';
import { runOptionalCaptureConnectors } from './integrationConnectors';
import { fireCaptureOutboundWebhook } from './integrationsOutbound';

/** Fire outbound webhook + optional Notion/Slack/Jira forwards (non-blocking for connectors). */
export function runCaptureIntegrations(clip: ClipRow, userDataPath: string): void {
  fireCaptureOutboundWebhook(clip, userDataPath);
  void runOptionalCaptureConnectors(clip, userDataPath, () => getSettingsMap());
}
