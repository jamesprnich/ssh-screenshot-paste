import * as vscode from "vscode";
import * as crypto from "crypto";
import * as posixPath from "path/posix";

const DEFAULT_DIR = ".vscode-screenshots";

/**
 * Saves image data to a .vscode-screenshots/ directory in the workspace root.
 * Returns the absolute remote path of the saved file.
 */
export async function saveToRemote(
  imageData: Buffer,
  folder: vscode.WorkspaceFolder,
  log: vscode.OutputChannel
): Promise<string> {
  const config = vscode.workspace.getConfiguration("terminalScreenshotPaste");
  let screenshotDir = config.get<string>("screenshotDir", DEFAULT_DIR);

  // Guard against path traversal — screenshotDir must resolve within the workspace
  if (posixPath.isAbsolute(screenshotDir)) {
    log.appendLine(`WARNING: Absolute screenshotDir "${screenshotDir}" ignored — using default`);
    screenshotDir = DEFAULT_DIR;
  }
  const resolved = posixPath.normalize(posixPath.join(folder.uri.path, screenshotDir));
  if (!resolved.startsWith(folder.uri.path + "/") && resolved !== folder.uri.path) {
    log.appendLine(`WARNING: screenshotDir "${screenshotDir}" escapes workspace — using default`);
    screenshotDir = DEFAULT_DIR;
  }

  const now = new Date();
  const timestamp = [
    now.getFullYear().toString(),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0"),
    "_",
    now.getHours().toString().padStart(2, "0"),
    now.getMinutes().toString().padStart(2, "0"),
    now.getSeconds().toString().padStart(2, "0"),
  ].join("");

  const hash = crypto.createHash("sha256").update(imageData).digest("hex").slice(0, 8);
  const filename = `${timestamp}_${hash}.png`;

  const dirPath = posixPath.join(folder.uri.path, screenshotDir);
  const filePath = posixPath.join(dirPath, filename);

  // Construct URI preserving remote scheme and authority from the workspace folder
  const dirUri = folder.uri.with({ path: dirPath });
  const fileUri = folder.uri.with({ path: filePath });

  log.appendLine(`Creating directory: ${dirUri.toString()}`);
  await vscode.workspace.fs.createDirectory(dirUri);

  log.appendLine(`Writing file: ${fileUri.toString()} (${imageData.length} bytes)`);
  await vscode.workspace.fs.writeFile(fileUri, imageData);

  // Ensure .gitignore excludes the screenshot directory
  if (config.get<boolean>("manageGitignore", false)) {
    await ensureGitignore(folder, screenshotDir, log);
  }

  // Clean up old screenshots in the background
  cleanupOldScreenshots(folder, screenshotDir, log).catch(() => {});

  return filePath;
}

/**
 * Deletes screenshots older than the configured retention period.
 * Filenames encode the timestamp as YYYYMMDD_HHMMSS so we parse that.
 */
async function cleanupOldScreenshots(
  folder: vscode.WorkspaceFolder,
  screenshotDir: string,
  log: vscode.OutputChannel
): Promise<void> {
  const config = vscode.workspace.getConfiguration("terminalScreenshotPaste");
  const retentionDays = config.get<number>("retentionDays", 30);

  if (retentionDays <= 0) {
    return; // 0 = never delete
  }

  const dirPath = posixPath.join(folder.uri.path, screenshotDir);
  const dirUri = folder.uri.with({ path: dirPath });

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(dirUri);
  } catch {
    return; // Directory doesn't exist yet
  }

  for (const [name, type] of entries) {
    if (type !== vscode.FileType.File || !name.endsWith(".png")) {
      continue;
    }

    // Parse timestamp from filename: 20260306_143045_abc12345.png
    const match = name.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_/);
    if (!match) {
      continue;
    }

    const fileDate = new Date(
      parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
      parseInt(match[4]), parseInt(match[5]), parseInt(match[6])
    );

    if (fileDate.getTime() < cutoff) {
      const fileUri = folder.uri.with({ path: posixPath.join(dirPath, name) });
      try {
        await vscode.workspace.fs.delete(fileUri);
        log.appendLine(`Cleaned up old screenshot: ${name}`);
      } catch {
        // Ignore individual delete failures
      }
    }
  }
}

/**
 * Adds the screenshot directory to .gitignore if not already present.
 */
async function ensureGitignore(
  folder: vscode.WorkspaceFolder,
  screenshotDir: string,
  log: vscode.OutputChannel
): Promise<void> {
  const gitignorePath = posixPath.join(folder.uri.path, ".gitignore");
  const gitignoreUri = folder.uri.with({ path: gitignorePath });

  // Normalise entry: ensure it ends with /
  const entry = screenshotDir.endsWith("/") ? screenshotDir : `${screenshotDir}/`;

  try {
    const existing = await vscode.workspace.fs.readFile(gitignoreUri);
    const content = Buffer.from(existing).toString("utf-8");

    // Check if already listed (with or without trailing slash)
    const lines = content.split("\n").map((l) => l.trim());
    if (lines.includes(entry) || lines.includes(screenshotDir)) {
      return;
    }

    // Append entry
    const separator = content.endsWith("\n") ? "" : "\n";
    const updated = `${content}${separator}${entry}\n`;
    await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(updated, "utf-8"));
    log.appendLine(`Added ${entry} to .gitignore`);
  } catch {
    // .gitignore doesn't exist — create it
    await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(`${entry}\n`, "utf-8"));
    log.appendLine(`Created .gitignore with ${entry}`);
  }
}
