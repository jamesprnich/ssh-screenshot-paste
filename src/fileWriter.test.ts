import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as crypto from "crypto";

const { mockFs, mockGetConfiguration } = vi.hoisted(() => ({
  mockFs: {
    createDirectory: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(new Uint8Array()),
    readDirectory: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  mockGetConfiguration: vi.fn().mockReturnValue({
    get: vi.fn(),
  }),
}));

vi.mock("vscode", () => ({
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
  workspace: {
    getConfiguration: mockGetConfiguration,
    fs: mockFs,
  },
}));

import * as vscode from "vscode";
import { saveToRemote } from "./fileWriter";

// --- Helpers ---

function makeMockFolder(workspacePath: string) {
  const makeUri = (path: string) => ({
    scheme: "vscode-remote",
    authority: "ssh-remote+myhost",
    path,
    with(change: { path?: string }) {
      return makeUri(change.path ?? path);
    },
    toString() {
      return `${this.scheme}://${this.authority}${this.path}`;
    },
  });

  return {
    uri: makeUri(workspacePath),
    name: "test-workspace",
    index: 0,
  } as unknown as vscode.WorkspaceFolder;
}

function makeMockLog() {
  return { appendLine: vi.fn() } as unknown as vscode.OutputChannel;
}

function setupConfig(values: Record<string, unknown>) {
  mockGetConfiguration.mockReturnValue({
    get: vi.fn((key: string, defaultValue: unknown) => {
      return key in values ? values[key] : defaultValue;
    }),
  } as unknown as vscode.WorkspaceConfiguration);
}

const TEST_IMAGE = Buffer.from("fake-png-image-data");
const TEST_HASH = crypto
  .createHash("sha256")
  .update(TEST_IMAGE)
  .digest("hex")
  .slice(0, 8);

// Flush microtask queue so fire-and-forget cleanup promises settle
async function flushPromises() {
  await vi.advanceTimersByTimeAsync(0);
}

// --- Tests ---

describe("saveToRemote", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15, 14, 30, 45)); // 2026-03-15 14:30:45
    setupConfig({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("timestamp and filename format", () => {
    it("generates filename with YYYYMMDD_HHMMSS timestamp and 8-char SHA256 prefix", async () => {
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      const result = await saveToRemote(TEST_IMAGE, folder, log);

      expect(result).toBe(
        `/workspace/.vscode-screenshots/20260315_143045_${TEST_HASH}.png`
      );
    });

    it("uses custom screenshotDir from configuration", async () => {
      setupConfig({ screenshotDir: "my-screenshots" });
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      const result = await saveToRemote(TEST_IMAGE, folder, log);

      expect(result).toContain("/workspace/my-screenshots/");
    });
  });

  describe("path traversal guard", () => {
    it("rejects absolute screenshotDir and falls back to default", async () => {
      setupConfig({ screenshotDir: "/etc/evil" });
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      const result = await saveToRemote(TEST_IMAGE, folder, log);

      expect(result).toContain("/.vscode-screenshots/");
      expect(log.appendLine).toHaveBeenCalledWith(
        expect.stringContaining("Absolute")
      );
    });

    it("rejects ../ traversal and falls back to default", async () => {
      setupConfig({ screenshotDir: "../../etc/evil" });
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      const result = await saveToRemote(TEST_IMAGE, folder, log);

      expect(result).toContain("/.vscode-screenshots/");
      expect(log.appendLine).toHaveBeenCalledWith(
        expect.stringContaining("escapes workspace")
      );
    });

    it("accepts a legitimate subdirectory name", async () => {
      setupConfig({ screenshotDir: "images/screenshots" });
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      const result = await saveToRemote(TEST_IMAGE, folder, log);

      expect(result).toContain("/workspace/images/screenshots/");
    });
  });

  describe("cleanup / retention", () => {
    it("retentionDays=0 skips cleanup entirely", async () => {
      setupConfig({ retentionDays: 0 });
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      await saveToRemote(TEST_IMAGE, folder, log);
      await flushPromises();

      expect(mockFs.readDirectory).not.toHaveBeenCalled();
    });

    it("deletes files older than retention cutoff", async () => {
      setupConfig({ retentionDays: 7 });
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      // 10 days ago: 2026-03-05
      const oldFile = "20260305_143045_abcd1234.png";
      // 3 days ago: 2026-03-12
      const recentFile = "20260312_143045_efgh5678.png";

      mockFs.readDirectory.mockResolvedValue([
        [oldFile, vscode.FileType.File],
        [recentFile, vscode.FileType.File],
      ]);

      await saveToRemote(TEST_IMAGE, folder, log);
      await flushPromises();

      const deleteCalls = mockFs.delete.mock.calls;
      const deletedPaths = deleteCalls.map(
        (call) => (call[0] as unknown as { path: string }).path
      );

      expect(deletedPaths).toContain(
        `/workspace/.vscode-screenshots/${oldFile}`
      );
      expect(deletedPaths).not.toContain(
        `/workspace/.vscode-screenshots/${recentFile}`
      );
    });

    it("keeps files newer than retention cutoff", async () => {
      setupConfig({ retentionDays: 30 });
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      const recentFile = "20260312_143045_abcd1234.png";
      mockFs.readDirectory.mockResolvedValue([
        [recentFile, vscode.FileType.File],
      ]);

      await saveToRemote(TEST_IMAGE, folder, log);
      await flushPromises();

      expect(mockFs.delete).not.toHaveBeenCalled();
    });

    it("ignores non-png files and files without parseable timestamps", async () => {
      setupConfig({ retentionDays: 7 });
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      mockFs.readDirectory.mockResolvedValue([
        ["README.md", vscode.FileType.File],
        ["subdir", vscode.FileType.Directory],
        ["random_name.png", vscode.FileType.File],
      ]);

      await saveToRemote(TEST_IMAGE, folder, log);
      await flushPromises();

      expect(mockFs.delete).not.toHaveBeenCalled();
    });

    it("handles readDirectory failure gracefully", async () => {
      setupConfig({ retentionDays: 7 });
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      mockFs.readDirectory.mockRejectedValue(
        new Error("ENOENT")
      );

      // Should not throw
      await saveToRemote(TEST_IMAGE, folder, log);
      await flushPromises();
    });
  });

  describe("gitignore management", () => {
    it("does not touch .gitignore when manageGitignore is false", async () => {
      setupConfig({ manageGitignore: false });
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      await saveToRemote(TEST_IMAGE, folder, log);

      const readCalls = mockFs.readFile.mock.calls;
      const readPaths = readCalls.map(
        (call) => (call[0] as unknown as { path: string }).path
      );
      expect(readPaths).not.toContain("/workspace/.gitignore");
    });

    it("creates .gitignore with entry when file does not exist", async () => {
      setupConfig({ manageGitignore: true });
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      mockFs.readFile.mockRejectedValue(
        new Error("ENOENT")
      );

      await saveToRemote(TEST_IMAGE, folder, log);

      const writeCalls = mockFs.writeFile.mock.calls;
      const gitignoreWrite = writeCalls.find(
        (call) =>
          (call[0] as unknown as { path: string }).path ===
          "/workspace/.gitignore"
      );

      expect(gitignoreWrite).toBeDefined();
      const content = Buffer.from(gitignoreWrite![1] as Uint8Array).toString(
        "utf-8"
      );
      expect(content).toBe(".vscode-screenshots/\n");
    });

    it("appends entry to existing .gitignore without the entry", async () => {
      setupConfig({ manageGitignore: true });
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      mockFs.readFile.mockResolvedValue(
        Buffer.from("node_modules/\n")
      );

      await saveToRemote(TEST_IMAGE, folder, log);

      const writeCalls = mockFs.writeFile.mock.calls;
      const gitignoreWrite = writeCalls.find(
        (call) =>
          (call[0] as unknown as { path: string }).path ===
          "/workspace/.gitignore"
      );

      expect(gitignoreWrite).toBeDefined();
      const content = Buffer.from(gitignoreWrite![1] as Uint8Array).toString(
        "utf-8"
      );
      expect(content).toBe("node_modules/\n.vscode-screenshots/\n");
    });

    it("does not duplicate entry when .gitignore already contains it (with trailing slash)", async () => {
      setupConfig({ manageGitignore: true });
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      mockFs.readFile.mockResolvedValue(
        Buffer.from("node_modules/\n.vscode-screenshots/\n")
      );

      await saveToRemote(TEST_IMAGE, folder, log);

      const writeCalls = mockFs.writeFile.mock.calls;
      const gitignoreWrite = writeCalls.find(
        (call) =>
          (call[0] as unknown as { path: string }).path ===
          "/workspace/.gitignore"
      );

      expect(gitignoreWrite).toBeUndefined();
    });

    it("does not duplicate entry when .gitignore already contains it (without trailing slash)", async () => {
      setupConfig({ manageGitignore: true });
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      mockFs.readFile.mockResolvedValue(
        Buffer.from("node_modules/\n.vscode-screenshots\n")
      );

      await saveToRemote(TEST_IMAGE, folder, log);

      const writeCalls = mockFs.writeFile.mock.calls;
      const gitignoreWrite = writeCalls.find(
        (call) =>
          (call[0] as unknown as { path: string }).path ===
          "/workspace/.gitignore"
      );

      expect(gitignoreWrite).toBeUndefined();
    });

    it("appends newline separator when existing .gitignore lacks trailing newline", async () => {
      setupConfig({ manageGitignore: true });
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      mockFs.readFile.mockResolvedValue(
        Buffer.from("node_modules/")
      );

      await saveToRemote(TEST_IMAGE, folder, log);

      const writeCalls = mockFs.writeFile.mock.calls;
      const gitignoreWrite = writeCalls.find(
        (call) =>
          (call[0] as unknown as { path: string }).path ===
          "/workspace/.gitignore"
      );

      expect(gitignoreWrite).toBeDefined();
      const content = Buffer.from(gitignoreWrite![1] as Uint8Array).toString(
        "utf-8"
      );
      expect(content).toBe("node_modules/\n.vscode-screenshots/\n");
    });
  });

  describe("URI construction", () => {
    it("preserves remote scheme and authority in constructed URIs", async () => {
      const folder = makeMockFolder("/workspace");
      const log = makeMockLog();

      await saveToRemote(TEST_IMAGE, folder, log);

      const createDirCalls = mockFs.createDirectory.mock.calls;
      const dirUri = createDirCalls[0][0] as unknown as {
        scheme: string;
        authority: string;
      };
      expect(dirUri.scheme).toBe("vscode-remote");
      expect(dirUri.authority).toBe("ssh-remote+myhost");

      const writeCalls = mockFs.writeFile.mock.calls;
      const fileUri = writeCalls[0][0] as unknown as {
        scheme: string;
        authority: string;
      };
      expect(fileUri.scheme).toBe("vscode-remote");
      expect(fileUri.authority).toBe("ssh-remote+myhost");
    });
  });
});
