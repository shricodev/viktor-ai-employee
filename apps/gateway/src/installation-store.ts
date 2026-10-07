import type { Installation, InstallationQuery, InstallationStore } from "@slack/bolt";
import { logger } from "@viktor/config";
import { getInstallation, getWorkspace, markUninstalled, upsertWorkspace } from "@viktor/db";
import { welcome } from "./onboarding.ts";

export const installationStore: InstallationStore = {
  async storeInstallation(installation) {
    if (installation.isEnterpriseInstall || !installation.team) {
      throw new Error("Org-wide installs are not supported yet; install into a single workspace.");
    }
    if (!installation.bot) throw new Error("Installation is missing a bot token");
    const existing = await getWorkspace(installation.team.id);
    await upsertWorkspace({
      id: installation.team.id,
      enterpriseId: installation.enterprise?.id ?? null,
      name: installation.team.name ?? installation.team.id,
      botUserId: installation.bot.userId,
      botId: installation.bot.id,
      installerUserId: installation.user.id,
      installation,
    });
    if (!existing) {
      void welcome(installation.team.id, installation.bot.token, installation.user.id).catch(
        (err) => logger.warn({ err }, "welcome flow failed"),
      );
    }
  },

  async fetchInstallation(query: InstallationQuery<boolean>) {
    if (!query.teamId) throw new Error("Org-wide installs are not supported");
    const installation = await getInstallation<Installation>(query.teamId);
    if (!installation) throw new Error(`No installation for team ${query.teamId}`);
    return installation;
  },

  async deleteInstallation(query: InstallationQuery<boolean>) {
    if (query.teamId) await markUninstalled(query.teamId);
  },
};
