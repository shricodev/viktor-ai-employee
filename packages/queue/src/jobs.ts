export type RunTrigger = "mention" | "dm" | "schedule" | "event" | "proactive";

export type SlackFileRef = {
  id: string;
  name: string;
  mimetype: string;
  urlPrivate: string;
  size: number;
};

export type AgentRunJob = {
  runId: string;
  workspaceId: string;
  channelId: string;
  threadTs: string;
  messageTs?: string;
  userId?: string;
  text: string;
  trigger: RunTrigger;
  files?: SlackFileRef[];
};

export type ScheduledRunJob = { scheduleId: string };

export type TriggerEventJob = {
  subscriptionId: string;
  triggerSlug: string;
  payload: unknown;
};

export type ChannelMessageJob = {
  workspaceId: string;
  channelId: string;
  ts: string;
  threadTs?: string;
  userId: string;
  text: string;
};

export type DailyCheckinJob = { workspaceId: string };

export type WipeWorkspaceJob = { workspaceId: string; requestedBy: string };

export type JobMap = {
  "agent-run": AgentRunJob;
  "scheduled-run": ScheduledRunJob;
  "trigger-event": TriggerEventJob;
  "channel-message": ChannelMessageJob;
  "daily-checkin": DailyCheckinJob;
  "wipe-workspace": WipeWorkspaceJob;
};

export type QueueName = keyof JobMap;
