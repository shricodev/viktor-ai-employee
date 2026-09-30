import { PassThrough } from "node:stream";
import { env, logger } from "@viktor/config";
import Docker from "dockerode";
import { containerName, resolveWorkspacePath, truncate, volumeName } from "./paths.ts";
import { packFile, unpackFirstFile } from "./tar.ts";

const docker = new Docker();
const lastUsed = new Map<string, number>();
const starting = new Map<string, Promise<Docker.Container>>();

const MAX_OUTPUT_CHARS = 30_000;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

function isNotFound(err: unknown): boolean {
  return (err as { statusCode?: number })?.statusCode === 404;
}

async function create(workspaceId: string): Promise<Docker.Container> {
  const config = env();
  const name = containerName(workspaceId);
  await docker.createVolume({
    Name: volumeName(workspaceId),
    Labels: { "viktor.workspace": workspaceId },
  });
  const container = await docker.createContainer({
    name,
    Image: config.SANDBOX_IMAGE,
    Labels: { "viktor.sandbox": "1", "viktor.workspace": workspaceId },
    WorkingDir: "/workspace",
    User: "1000:1000",
    Env: [`VIKTOR_WORKSPACE=${workspaceId}`],
    HostConfig: {
      Binds: [`${volumeName(workspaceId)}:/workspace`],
      Memory: config.SANDBOX_MEMORY_MB * 1024 * 1024,
      MemorySwap: config.SANDBOX_MEMORY_MB * 1024 * 1024,
      NanoCpus: Math.round(config.SANDBOX_CPUS * 1e9),
      PidsLimit: 512,
      ReadonlyRootfs: true,
      Tmpfs: { "/tmp": "rw,nosuid,size=512m" },
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
      NetworkMode: config.SANDBOX_NETWORK,
      RestartPolicy: { Name: "no" },
    },
  });
  await container.start();
  logger.info({ workspaceId, name }, "sandbox created");
  return container;
}

async function ensureRunning(workspaceId: string): Promise<Docker.Container> {
  const container = docker.getContainer(containerName(workspaceId));
  try {
    const info = await container.inspect();
    if (!info.State.Running) await container.start();
    return container;
  } catch (err) {
    if (!isNotFound(err)) throw err;
    return create(workspaceId);
  }
}

export async function ensureSandbox(workspaceId: string): Promise<Docker.Container> {
  lastUsed.set(workspaceId, Date.now());
  let pending = starting.get(workspaceId);
  if (!pending) {
    pending = ensureRunning(workspaceId).finally(() => starting.delete(workspaceId));
    starting.set(workspaceId, pending);
  }
  return pending;
}

export type ExecResult = { exitCode: number; stdout: string; stderr: string; timedOut: boolean };

export async function execInSandbox(
  workspaceId: string,
  command: string,
  opts: { timeoutSec?: number; cwd?: string } = {},
): Promise<ExecResult> {
  const container = await ensureSandbox(workspaceId);
  const timeoutSec = Math.min(Math.max(opts.timeoutSec ?? 120, 1), 900);
  const exec = await container.exec({
    Cmd: ["timeout", "-k", "5", String(timeoutSec), "bash", "-lc", command],
    WorkingDir: resolveWorkspacePath(opts.cwd ?? "."),
    AttachStdout: true,
    AttachStderr: true,
    User: "1000:1000",
  });
  const stream = await exec.start({ hijack: true, stdin: false });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  stdout.on("data", (c: Buffer) => out.push(c));
  stderr.on("data", (c: Buffer) => err.push(c));
  docker.modem.demuxStream(stream, stdout, stderr);
  await new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  const { ExitCode } = await exec.inspect();
  const exitCode = ExitCode ?? -1;
  lastUsed.set(workspaceId, Date.now());
  return {
    exitCode,
    timedOut: exitCode === 124 || exitCode === 137,
    stdout: truncate(Buffer.concat(out).toString("utf8"), MAX_OUTPUT_CHARS),
    stderr: truncate(Buffer.concat(err).toString("utf8"), MAX_OUTPUT_CHARS),
  };
}

export async function writeSandboxFile(
  workspaceId: string,
  path: string,
  content: Buffer | string,
): Promise<string> {
  const target = resolveWorkspacePath(path);
  const dir = target.slice(0, target.lastIndexOf("/")) || "/workspace";
  const name = target.slice(target.lastIndexOf("/") + 1);
  const container = await ensureSandbox(workspaceId);
  await execInSandbox(workspaceId, `mkdir -p '${dir.replaceAll("'", "'\\''")}'`);
  const archive = await packFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content));
  await container.putArchive(archive, { path: dir });
  return target;
}

export async function readSandboxFile(
  workspaceId: string,
  path: string,
  maxBytes = MAX_FILE_BYTES,
): Promise<Buffer> {
  const container = await ensureSandbox(workspaceId);
  const stream = await container.getArchive({ path: resolveWorkspacePath(path) });
  return unpackFirstFile(stream, maxBytes);
}

/** Stops containers that have not been used recently. Their volumes are kept. */
export async function reapIdleSandboxes(idleMs: number): Promise<number> {
  const containers = await docker.listContainers({ filters: { label: ["viktor.sandbox=1"] } });
  let stopped = 0;
  for (const info of containers) {
    const workspaceId = info.Labels["viktor.workspace"];
    if (!workspaceId) continue;
    const used = lastUsed.get(workspaceId) ?? 0;
    if (Date.now() - used < idleMs) continue;
    await docker
      .getContainer(info.Id)
      .stop({ t: 5 })
      .then(() => stopped++)
      .catch((err) => logger.warn({ err, workspaceId }, "failed to stop idle sandbox"));
    lastUsed.delete(workspaceId);
  }
  return stopped;
}

/** Deletes the container and its volume. Used when a workspace asks to be wiped. */
export async function destroySandbox(workspaceId: string): Promise<void> {
  const container = docker.getContainer(containerName(workspaceId));
  await container.remove({ force: true }).catch((err) => {
    if (!isNotFound(err)) throw err;
  });
  await docker
    .getVolume(volumeName(workspaceId))
    .remove()
    .catch((err) => {
      if (!isNotFound(err)) throw err;
    });
  lastUsed.delete(workspaceId);
}
