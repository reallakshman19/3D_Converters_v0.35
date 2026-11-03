const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT_DIR, '.backups');
const LOG_FILE = path.join(BACKUP_DIR, 'log.json');

// Ensure backup directory exists
function ensureDirectories() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

// Load log
function loadLog() {
  ensureDirectories();
  if (fs.existsSync(LOG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    } catch (e) {
      console.warn('Failed to parse log file, resetting.', e);
    }
  }
  return { lastId: 0, entries: [] };
}

// Save log
function saveLog(log) {
  ensureDirectories();
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf8');
}

// Format date to local ISO-like format
function formatLocalTime(date) {
  const tzoffset = date.getTimezoneOffset() * 60000; // offset in milliseconds
  const localISOTime = (new Date(date - tzoffset)).toISOString().slice(0, -1);
  return localISOTime.replace('T', ' ').substring(0, 19);
}

// CLI Commands
const commands = {
  save(filePathArg, context) {
    if (!filePathArg) {
      console.error('Error: Please specify the file path to back up.');
      process.exit(1);
    }

    const absolutePath = path.resolve(process.cwd(), filePathArg);
    if (!fs.existsSync(absolutePath)) {
      console.error(`Error: File not found: ${absolutePath}`);
      process.exit(1);
    }

    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      console.error('Error: Target is a directory. Backup only supports single files.');
      process.exit(1);
    }

    const relativePath = path.relative(ROOT_DIR, absolutePath);
    const content = fs.readFileSync(absolutePath, 'utf8');

    const log = loadLog();
    const id = log.lastId + 1;
    const timestamp = formatLocalTime(new Date());
    const fileSlug = relativePath.replace(/[^a-zA-Z0-9]/g, '_');
    const backupFileName = `${id}_${fileSlug}.bak`;
    const backupFilePath = path.join(BACKUP_DIR, backupFileName);

    // Save backup file
    fs.writeFileSync(backupFilePath, content, 'utf8');

    // Add entry
    const entry = {
      id,
      timestamp,
      file: relativePath,
      context: context || 'No context provided',
      backupFile: backupFileName
    };
    log.entries.push(entry);
    log.lastId = id;
    saveLog(log);

    console.log(`\x1b[32mSuccessfully saved backup #${id} for ${relativePath}\x1b[0m`);
    console.log(`Context: "${entry.context}"`);
    console.log(`Time:    ${entry.timestamp}`);
  },

  list(filterFile) {
    const log = loadLog();
    if (!log.entries.length) {
      console.log('No backups created yet.');
      return;
    }

    console.log('\n\x1b[36m=== Backups list ===\x1b[0m');
    const filtered = filterFile 
      ? log.entries.filter(e => e.file.toLowerCase().includes(filterFile.toLowerCase()))
      : log.entries;

    if (!filtered.length) {
      console.log(`No backups found matching: ${filterFile}`);
      return;
    }

    filtered.forEach(entry => {
      console.log(`[#${entry.id}] \x1b[33m${entry.timestamp}\x1b[0m - \x1b[35m${entry.file}\x1b[0m`);
      console.log(`     Context: "${entry.context}"`);
      console.log('--------------------------------------------------');
    });
  },

  restore(idArg) {
    if (!idArg) {
      console.error('Error: Please specify the backup ID to restore.');
      process.exit(1);
    }

    const id = parseInt(idArg, 10);
    const log = loadLog();
    const entry = log.entries.find(e => e.id === id);

    if (!entry) {
      console.error(`Error: Backup with ID #${id} not found.`);
      process.exit(1);
    }

    const backupFilePath = path.join(BACKUP_DIR, entry.backupFile);
    if (!fs.existsSync(backupFilePath)) {
      console.error(`Error: Backup file file not found on disk: ${backupFilePath}`);
      process.exit(1);
    }

    const targetFilePath = path.join(ROOT_DIR, entry.file);
    const targetDir = path.dirname(targetFilePath);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Safety backup of the current file before overwriting (if it exists)
    if (fs.existsSync(targetFilePath)) {
      const currentContent = fs.readFileSync(targetFilePath, 'utf8');
      const backupContent = fs.readFileSync(backupFilePath, 'utf8');
      if (currentContent === backupContent) {
        console.log(`\x1b[33mFile ${entry.file} is already identical to backup #${id}. No action needed.\x1b[0m`);
        return;
      }
      
      const safetyId = log.lastId + 1;
      const safetyFileName = `${safetyId}_safety_${entry.backupFile}`;
      const safetyFilePath = path.join(BACKUP_DIR, safetyFileName);
      fs.writeFileSync(safetyFilePath, currentContent, 'utf8');
      
      log.entries.push({
        id: safetyId,
        timestamp: formatLocalTime(new Date()),
        file: entry.file,
        context: `Auto-safety backup before restoring #${id}`,
        backupFile: safetyFileName
      });
      log.lastId = safetyId;
      saveLog(log);
      console.log(`\x1b[33mSaved auto-safety backup #${safetyId} of current file.\x1b[0m`);
    }

    const content = fs.readFileSync(backupFilePath, 'utf8');
    fs.writeFileSync(targetFilePath, content, 'utf8');

    console.log(`\x1b[32mSuccessfully restored backup #${id} to ${entry.file}\x1b[0m`);
  },

  diff(idArg) {
    if (!idArg) {
      console.error('Error: Please specify the backup ID to diff.');
      process.exit(1);
    }

    const id = parseInt(idArg, 10);
    const log = loadLog();
    const entry = log.entries.find(e => e.id === id);

    if (!entry) {
      console.error(`Error: Backup with ID #${id} not found.`);
      process.exit(1);
    }

    const backupFilePath = path.join(BACKUP_DIR, entry.backupFile);
    if (!fs.existsSync(backupFilePath)) {
      console.error(`Error: Backup file file not found on disk: ${backupFilePath}`);
      process.exit(1);
    }

    const targetFilePath = path.join(ROOT_DIR, entry.file);
    if (!fs.existsSync(targetFilePath)) {
      console.log(`File ${entry.file} does not exist currently. Showing entire backup as additions:`);
      const backupText = fs.readFileSync(backupFilePath, 'utf8');
      console.log(backupText.split('\n').map(l => `\x1b[32m+ ${l}\x1b[0m`).join('\n'));
      return;
    }

    const oldText = fs.readFileSync(backupFilePath, 'utf8');
    const newText = fs.readFileSync(targetFilePath, 'utf8');

    const oldLines = oldText.split(/\r?\n/);
    const newLines = newText.split(/\r?\n/);

    const diffs = getDiff(oldLines, newLines);

    console.log(`\n\x1b[36m=== Diff: Backup #${id} (old) vs. Current file (new) ===\x1b[0m`);
    console.log(`File: ${entry.file}`);
    console.log('--------------------------------------------------');

    diffs.forEach(change => {
      if (change.type === 'added') {
        console.log(`\x1b[32m+ ${change.text}\x1b[0m`);
      } else if (change.type === 'removed') {
        console.log(`\x1b[31m- ${change.text}\x1b[0m`);
      } else {
        // Show context only, optional: skip rendering unchanged lines if too long
        console.log(`  ${change.text}`);
      }
    });
    console.log('--------------------------------------------------');
  }
};

// Longest Common Subsequence Diff algorithm
function getDiff(oldLines, newLines) {
  const dp = Array(oldLines.length + 1).fill(null).map(() => Array(newLines.length + 1).fill(0));
  for (let i = 1; i <= oldLines.length; i++) {
    for (let j = 1; j <= newLines.length; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const diff = [];
  let i = oldLines.length;
  let j = newLines.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({ type: 'common', text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: 'added', text: newLines[j - 1] });
      j--;
    } else {
      diff.unshift({ type: 'removed', text: oldLines[i - 1] });
      i--;
    }
  }
  return diff;
}

// Run CLI
const [,, cmd, ...args] = process.argv;

if (!cmd || !commands[cmd]) {
  console.log(`
\x1b[36mBackup Manager Utility\x1b[0m
Usage:
  node utils/backup.js save <file-path> "<context/reason>"
  node utils/backup.js list [file-filter]
  node utils/backup.js diff <backup-id>
  node utils/backup.js restore <backup-id>
`);
  process.exit(0);
}

commands[cmd](...args);
