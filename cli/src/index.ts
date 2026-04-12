#!/usr/bin/env node

/**
 * DevClip CLI
 * Command-line interface for DevClip clipboard manager
 *
 * Commands:
 *   search <query>     Search clipboard history
 *   paste [id]         Paste clip by ID or latest
 *   snippet <name>     Run/expand snippet by name/shortcode
 *   snippets           List all snippets
 *   history            Show recent history
 *   config             Show configuration
 */

import { Command } from 'commander';
import Database from 'better-sqlite3';
import chalk from 'chalk';
import { homedir, platform } from 'os';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

const program = new Command();

// Determine DevClip data directory based on platform
function getDevClipDataDir(): string {
  const plat = platform();
  if (plat === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'DevClip');
  }
  if (plat === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'DevClip');
  }
  // Linux and others
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'devclip');
}

// Get database path
function getDbPath(): string {
  return join(getDevClipDataDir(), 'devclip.db');
}

// Open database connection
function openDb() {
  const dbPath = getDbPath();
  
  if (!existsSync(dbPath)) {
    console.error(chalk.red(`Error: DevClip database not found at ${dbPath}`));
    console.error(chalk.yellow('Make sure DevClip is installed and has been run at least once.'));
    process.exit(1);
  }
  
  try {
    return new Database(dbPath, { readonly: true });
  } catch (err) {
    console.error(chalk.red(`Error opening database: ${(err as Error).message}`));
    process.exit(1);
  }
}

// Get latest clip ID
function getLatestClipId(db: Database.Database): number | null {
  const row = db.prepare('SELECT id FROM clips ORDER BY created_at DESC LIMIT 1').get() as { id: number } | undefined;
  return row?.id ?? null;
}

// Copy text to clipboard (cross-platform)
function copyToClipboard(text: string): void {
  const plat = platform();
  
  if (plat === 'darwin') {
    // macOS - use pbcopy
    const { execSync } = await import('child_process');
    execSync('pbcopy', { input: text });
  } else if (plat === 'win32') {
    // Windows - use clip
    const { execSync } = await import('child_process');
    execSync('clip', { input: text });
  } else {
    // Linux - try wl-copy (Wayland) or xclip (X11)
    try {
      const { execSync } = await import('child_process');
      execSync('wl-copy', { input: text });
    } catch {
      try {
        const { execSync } = await import('child_process');
        execSync('xclip -selection clipboard', { input: text });
      } catch {
        console.error(chalk.red('Error: Could not copy to clipboard. Install wl-copy or xclip.'));
        process.exit(1);
      }
    }
  }
}

program
  .name('devclip')
  .description('CLI for DevClip clipboard manager')
  .version('1.0.0');

// Search command
program
  .command('search <query>')
  .description('Search clipboard history')
  .option('-t, --type <type>', 'Filter by type (text, code, json, url, etc.)')
  .option('-l, --limit <n>', 'Limit results', '20')
  .action((query: string, options: { type?: string; limit?: string }) => {
    const db = openDb();
    
    let sql = `
      SELECT id, content, type, source, created_at, is_pinned, use_count
      FROM clips
      WHERE content LIKE ? AND deleted_at IS NULL
    `;
    const params: (string | number)[] = [`%${query}%`];
    
    if (options.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }
    
    sql += ' ORDER BY is_pinned DESC, created_at DESC LIMIT ?';
    params.push(parseInt(options.limit || '20', 10));
    
    const rows = db.prepare(sql).all(...params) as Array<{
      id: number;
      content: string;
      type: string;
      source: string | null;
      created_at: number;
      is_pinned: number;
      use_count: number;
    }>;
    
    if (rows.length === 0) {
      console.log(chalk.yellow('No results found.'));
      return;
    }
    
    console.log(chalk.bold(`\nFound ${rows.length} results:\n`));
    
    for (const row of rows) {
      const date = new Date(row.created_at * 1000).toLocaleString();
      const pinned = row.is_pinned ? chalk.red('📌') : '  ';
      const preview = row.content.slice(0, 80).replace(/\n/g, '\\n');
      const ellipsis = row.content.length > 80 ? '...' : '';
      
      console.log(`${pinned} ${chalk.cyan(`#${row.id}`)} ${chalk.gray(`[${row.type}]`)} ${chalk.dim(date)}`);
      console.log(`   ${preview}${ellipsis}`);
      if (row.source) {
        console.log(`   ${chalk.dim(`Source: ${row.source}`)}`);
      }
      console.log();
    }
    
    db.close();
  });

// Paste command
program
  .command('paste [id]')
  .description('Paste clip by ID (or latest if no ID provided)')
  .option('-c, --copy', 'Copy to clipboard instead of printing')
  .action(async (idStr: string | undefined, options: { copy?: boolean }) => {
    const db = openDb();
    
    let id: number;
    if (idStr) {
      id = parseInt(idStr, 10);
      if (isNaN(id)) {
        console.error(chalk.red('Error: Invalid ID'));
        process.exit(1);
      }
    } else {
      const latestId = getLatestClipId(db);
      if (!latestId) {
        console.error(chalk.red('Error: No clips in history'));
        process.exit(1);
      }
      id = latestId;
    }
    
    const row = db.prepare('SELECT content, type FROM clips WHERE id = ? AND deleted_at IS NULL').get(id) as {
      content: string;
      type: string;
    } | undefined;
    
    if (!row) {
      console.error(chalk.red(`Error: Clip #${id} not found`));
      process.exit(1);
    }
    
    // Increment use count
    try {
      // Open write connection briefly
      const dbWrite = new Database(getDbPath());
      dbWrite.prepare('UPDATE clips SET use_count = use_count + 1 WHERE id = ?').run(id);
      dbWrite.close();
    } catch {
      // Read-only is fine
    }
    
    if (options.copy) {
      await copyToClipboard(row.content);
      console.log(chalk.green(`✓ Copied clip #${id} to clipboard`));
    } else {
      console.log(row.content);
    }
    
    db.close();
  });

// Snippet run command
program
  .command('snippet <name>')
  .description('Run/expand snippet by name or shortcode')
  .option('-c, --copy', 'Copy to clipboard instead of printing')
  .option('-i, --interactive', 'Interactive variable substitution')
  .action(async (name: string, options: { copy?: boolean; interactive?: boolean }) => {
    const db = openDb();
    
    // Search by title or shortcode
    const row = db.prepare(`
      SELECT id, title, content, variables
      FROM snippets
      WHERE (title = ? OR shortcode = ?) AND deleted_at IS NULL
      ORDER BY is_pinned DESC
      LIMIT 1
    `).get(name, name) as {
      id: number;
      title: string;
      content: string;
      variables: string;
    } | undefined;
    
    if (!row) {
      console.error(chalk.red(`Error: Snippet "${name}" not found`));
      process.exit(1);
    }
    
    let output = row.content;
    
    // Handle variable substitution
    if (row.variables) {
      try {
        const vars = JSON.parse(row.variables) as string[];
        
        if (vars.length > 0) {
          if (options.interactive) {
            const { createInterface } = await import('readline');
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            
            const askQuestion = (prompt: string): Promise<string> => {
              return new Promise((resolve) => {
                rl.question(prompt, resolve);
              });
            };
            
            console.log(chalk.dim(`Snippet has ${vars.length} variable(s): ${vars.join(', ')}`));
            
            for (const v of vars) {
              const value = await askQuestion(chalk.yellow(`${v}: `));
              output = output.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), value);
            }
            
            rl.close();
          } else {
            // Non-interactive: show warning about unsubstituted variables
            console.error(chalk.yellow(`Warning: Snippet has variables (${vars.join(', ')}) but --interactive not set`));
          }
        }
      } catch {
        // Ignore variable parsing errors
      }
    }
    
    // Increment use count
    try {
      const dbWrite = new Database(getDbPath());
      dbWrite.prepare('UPDATE snippets SET usage_count = usage_count + 1 WHERE id = ?').run(row.id);
      dbWrite.close();
    } catch {
      // Read-only is fine
    }
    
    if (options.copy) {
      await copyToClipboard(output);
      console.log(chalk.green(`✓ Copied snippet "${row.title}" to clipboard`));
    } else {
      console.log(output);
    }
    
    db.close();
  });

// List snippets command
program
  .command('snippets')
  .description('List all snippets')
  .option('-l, --limit <n>', 'Limit results', '50')
  .action((options: { limit?: string }) => {
    const db = openDb();
    
    const rows = db.prepare(`
      SELECT id, title, shortcode, category, is_pinned, usage_count
      FROM snippets
      WHERE deleted_at IS NULL
      ORDER BY is_pinned DESC, title ASC
      LIMIT ?
    `).all(parseInt(options.limit || '50', 10)) as Array<{
      id: number;
      title: string;
      shortcode: string | null;
      category: string | null;
      is_pinned: number;
      usage_count: number;
    }>;
    
    if (rows.length === 0) {
      console.log(chalk.yellow('No snippets found.'));
      return;
    }
    
    console.log(chalk.bold(`\n${rows.length} snippets:\n`));
    
    for (const row of rows) {
      const pinned = row.is_pinned ? chalk.red('📌') : '  ';
      const shortcode = row.shortcode ? chalk.cyan(`@${row.shortcode}`) : '';
      const category = row.category ? chalk.dim(`[${row.category}]`) : '';
      
      console.log(`${pinned} ${chalk.green(`#${row.id}`)} ${row.title} ${shortcode} ${category}`);
    }
    
    console.log();
    db.close();
  });

// History command
program
  .command('history')
  .description('Show recent clipboard history')
  .option('-l, --limit <n>', 'Number of items to show', '20')
  .option('--json', 'Output as JSON')
  .action((options: { limit?: string; json?: boolean }) => {
    const db = openDb();
    
    const rows = db.prepare(`
      SELECT id, content, type, source, created_at, is_pinned
      FROM clips
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ?
    `).all(parseInt(options.limit || '20', 10)) as Array<{
      id: number;
      content: string;
      type: string;
      source: string | null;
      created_at: number;
      is_pinned: number;
    }>;
    
    if (options.json) {
      console.log(JSON.stringify(rows, null, 2));
    } else {
      if (rows.length === 0) {
        console.log(chalk.yellow('No history found.'));
        return;
      }
      
      console.log(chalk.bold(`\nRecent ${rows.length} clips:\n`));
      
      for (const row of rows) {
        const date = new Date(row.created_at * 1000).toLocaleTimeString();
        const pinned = row.is_pinned ? chalk.red('📌') : '  ';
        const preview = row.content.slice(0, 60).replace(/\n/g, '\\n');
        const ellipsis = row.content.length > 60 ? '...' : '';
        
        console.log(`${pinned} ${chalk.cyan(`#${row.id}`)} ${chalk.gray(date)} ${chalk.dim(`[${row.type}]`)}`);
        console.log(`   ${preview}${ellipsis}`);
      }
    }
    
    db.close();
  });

// Config command
program
  .command('config')
  .description('Show DevClip configuration')
  .action(() => {
    const dataDir = getDevClipDataDir();
    const dbPath = getDbPath();
    
    console.log(chalk.bold('DevClip Configuration:'));
    console.log();
    console.log(`Data directory: ${chalk.cyan(dataDir)}`);
    console.log(`Database:       ${chalk.cyan(dbPath)}`);
    console.log(`Platform:       ${chalk.cyan(platform())}`);
    console.log();
    
    if (existsSync(dbPath)) {
      const db = openDb();
      
      // Get stats
      const clipCount = (db.prepare('SELECT COUNT(*) as count FROM clips WHERE deleted_at IS NULL').get() as { count: number }).count;
      const snippetCount = (db.prepare('SELECT COUNT(*) as count FROM snippets WHERE deleted_at IS NULL').get() as { count: number }).count;
      
      console.log(chalk.bold('Stats:'));
      console.log(`  Clips:    ${chalk.cyan(clipCount)}`);
      console.log(`  Snippets: ${chalk.cyan(snippetCount)}`);
      
      db.close();
    } else {
      console.log(chalk.yellow('Database not found. Run DevClip first.'));
    }
  });

program.parse();
