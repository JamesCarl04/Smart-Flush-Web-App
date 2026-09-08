#!/usr/bin/env node

/**
 * Klir Admin Web • Automated Git Release & Versioning Engine
 *
 * Analyzes Git commits using Conventional Commits:
 *   - feat(...) / feat:   -> MINOR bump (resets patch to 0)
 *   - fix(...) / fix:     -> PATCH bump
 *   - BREAKING CHANGE / ! -> MAJOR bump
 *
 * Synchronizes:
 *   1. package.json ("version")
 *   2. CHANGELOG.md
 *   3. Git release tags (e.g. v1.61.0)
 *
 * Usage:
 *   node scripts/release.js [--dry-run] [--type <major|minor|patch>]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PKG_PATH = path.join(ROOT_DIR, 'package.json');
const PKG_LOCK_PATH = path.join(ROOT_DIR, 'package-lock.json');
const CHANGELOG_PATH = path.join(ROOT_DIR, 'CHANGELOG.md');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const typeFlagIdx = args.indexOf('--type');
const explicitType = typeFlagIdx !== -1 && args[typeFlagIdx + 1] ? args[typeFlagIdx + 1].toLowerCase() : null;

if (explicitType && !['major', 'minor', 'patch'].includes(explicitType)) {
  console.error(`❌ Error: Invalid --type "${explicitType}". Valid types are: major, minor, patch.`);
  process.exit(1);
}

function runGit(cmd, throwOnError = false) {
  try {
    return execSync(cmd, { cwd: ROOT_DIR, stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
  } catch (err) {
    if (throwOnError) throw err;
    return '';
  }
}

function getLatestTag() {
  const describeTag = runGit('git describe --tags --abbrev=0');
  if (describeTag) return describeTag;

  const rawTags = runGit('git tag -l "v*"');
  if (!rawTags) return null;

  const tags = rawTags
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .sort((a, b) => {
      const aParts = a.replace(/^v/, '').split('.').map(Number);
      const bParts = b.replace(/^v/, '').split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if ((aParts[i] || 0) !== (bParts[i] || 0)) {
          return (bParts[i] || 0) - (aParts[i] || 0);
        }
      }
      return 0;
    });

  return tags[0] || null;
}

function getTotalCommitCount() {
  const count = runGit('git rev-list --count HEAD');
  return count ? parseInt(count, 10) : 158;
}

function parseSemver(versionStr) {
  const cleaned = (versionStr || '').replace(/^v/, '').trim();
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return { major: 1, minor: 0, patch: 0 };
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

function bumpSemver(current, bumpType) {
  const v = parseSemver(current);
  if (bumpType === 'major') {
    return `${v.major + 1}.0.0`;
  }
  if (bumpType === 'minor') {
    return `${v.major}.${v.minor + 1}.0`;
  }
  return `${v.major}.${v.minor}.${v.patch + 1}`;
}

function getCommits(range) {
  const gitCmd = range
    ? `git log ${range} --pretty=format:"%h%x09%s%x09%an%x09%ad" --date=short`
    : `git log --pretty=format:"%h%x09%s%x09%an%x09%ad" --date=short`;

  const output = runGit(gitCmd);
  if (!output) return [];

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, author, date] = line.split('\t');
      return { hash, subject: subject || '', author: author || '', date: date || '' };
    });
}

function categorizeCommits(commits) {
  const features = [];
  const fixes = [];
  const breaking = [];
  const chores = [];

  for (const c of commits) {
    const s = c.subject.trim();
    const isBreaking = /BREAKING CHANGE/i.test(s) || /^[a-z]+(\([a-z0-9_-]+\))?!:/.test(s);
    if (isBreaking) {
      breaking.push(c);
    } else if (/^feat(\([a-z0-9_-]+\))?:/i.test(s)) {
      features.push(c);
    } else if (/^fix(\([a-z0-9_-]+\))?:/i.test(s)) {
      fixes.push(c);
    } else {
      chores.push(c);
    }
  }

  return { features, fixes, breaking, chores };
}

function determineBumpType(categories) {
  if (explicitType && ['major', 'minor', 'patch'].includes(explicitType)) {
    return explicitType;
  }
  if (categories.breaking.length > 0) return 'major';
  if (categories.features.length > 0) return 'minor';
  if (categories.fixes.length > 0) return 'patch';
  return 'patch';
}

function formatChangelogEntry(version, date, categories) {
  let entry = `## [${version}] - ${date}\n\n`;

  if (categories.breaking.length > 0) {
    entry += `### ⚠ BREAKING CHANGES\n`;
    for (const c of categories.breaking) {
      entry += `- ${c.subject} (${c.hash})\n`;
    }
    entry += '\n';
  }

  if (categories.features.length > 0) {
    entry += `### Features\n`;
    for (const c of categories.features) {
      entry += `- ${c.subject} (${c.hash})\n`;
    }
    entry += '\n';
  }

  if (categories.fixes.length > 0) {
    entry += `### Bug Fixes\n`;
    for (const c of categories.fixes) {
      entry += `- ${c.subject} (${c.hash})\n`;
    }
    entry += '\n';
  }

  if (categories.chores.length > 0) {
    entry += `### Maintenance & Improvements\n`;
    for (const c of categories.chores) {
      entry += `- ${c.subject} (${c.hash})\n`;
    }
    entry += '\n';
  }

  return entry;
}

function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  KLIR ADMIN WEB • Automated Git Release & Versioning Engine   ');
  console.log('════════════════════════════════════════════════════════════════');

  if (!fs.existsSync(PKG_PATH)) {
    console.error('❌ Error: package.json not found in', ROOT_DIR);
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const currentVersion = pkg.version || '1.61.0';
  const totalCommits = getTotalCommitCount();
  const latestTag = getLatestTag();

  console.log(`📦 Current Package Version : ${currentVersion}`);
  console.log(`🏷️  Latest Git Release Tag   : ${latestTag || 'None (Initial Baseline)'}`);
  console.log(`📊 Total Repository Commits: ${totalCommits}`);

  let commits = [];
  let isBaselineRelease = false;

  if (latestTag) {
    commits = getCommits(`${latestTag}..HEAD`);
  } else {
    // No tags exist in the repo yet: initial release baseline derived from history
    commits = getCommits();
    isBaselineRelease = true;
  }

  const categories = categorizeCommits(commits);
  const bumpType = determineBumpType(categories);

  let nextVersion = currentVersion;
  let nextBuildCode = totalCommits;
  let releaseTypeDetected = 'BASELINE';

  if (explicitType) {
    nextVersion = bumpSemver(currentVersion, explicitType);
    nextBuildCode = totalCommits;
    releaseTypeDetected = `${explicitType.toUpperCase()} (EXPLICIT)`;
  } else if (isBaselineRelease) {
    nextVersion = currentVersion;
    nextBuildCode = totalCommits;
    releaseTypeDetected = 'BASELINE';
  } else if (commits.length === 0) {
    console.log('\n✨ No unreleased commits detected since ' + latestTag + '.');
    console.log(`   Repository is already synchronized at v${currentVersion} (build ${totalCommits}).`);
    if (isDryRun) {
      console.log('\n[DRY RUN] Next hypothetical release would be:');
      console.log(`   Patch: ${bumpSemver(currentVersion, 'patch')} (build ${totalCommits + 1})`);
      console.log(`   Minor: ${bumpSemver(currentVersion, 'minor')} (build ${totalCommits + 1})`);
      console.log('✓ Release check passed cleanly.\n');
      return;
    }
    return;
  } else {
    nextVersion = bumpSemver(currentVersion, bumpType);
    nextBuildCode = totalCommits;
    releaseTypeDetected = bumpType.toUpperCase();
  }

  const today = new Date().toISOString().split('T')[0];
  console.log(`\n🚀 Target Release Version  : v${nextVersion} (Build ${nextBuildCode})`);
  console.log(`🔍 Release Type Detected   : ${releaseTypeDetected}`);
  console.log(`📝 Commits Analyzed        : ${commits.length}`);
  console.log(`   • Features: ${categories.features.length}`);
  console.log(`   • Bug Fixes: ${categories.fixes.length}`);
  console.log(`   • Breaking: ${categories.breaking.length}`);
  console.log(`   • Maintenance: ${categories.chores.length}`);

  const changelogEntry = formatChangelogEntry(nextVersion, today, categories);

  if (isDryRun) {
    console.log('\n────────────────────────────────────────────────────────────────');
    console.log('  CHANGELOG PREVIEW (--dry-run)                                 ');
    console.log('────────────────────────────────────────────────────────────────\n');
    console.log(changelogEntry.trim());
    console.log('\n────────────────────────────────────────────────────────────────');
    console.log('  FILES TO BE SYNCHRONIZED:');
    console.log(`   • package.json                 -> "version": "${nextVersion}"`);
    if (fs.existsSync(PKG_LOCK_PATH)) {
      console.log(`   • package-lock.json            -> "version": "${nextVersion}"`);
    }
    console.log(`   • CHANGELOG.md                 -> prepend release section`);
    console.log(`   • Git Tag                      -> v${nextVersion}`);
    console.log('────────────────────────────────────────────────────────────────');
    console.log('\n[DRY RUN] Completed successfully. No files or Git tags were modified.\n');
    return;
  }

  // 1. Update package.json & package-lock.json
  pkg.version = nextVersion;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log('✓ Updated package.json');

  if (fs.existsSync(PKG_LOCK_PATH)) {
    try {
      const lock = JSON.parse(fs.readFileSync(PKG_LOCK_PATH, 'utf8'));
      lock.version = nextVersion;
      if (lock.packages && lock.packages['']) {
        lock.packages[''].version = nextVersion;
      }
      fs.writeFileSync(PKG_LOCK_PATH, JSON.stringify(lock, null, 2) + '\n', 'utf8');
      console.log('✓ Updated package-lock.json');
    } catch (err) {
      console.warn(`⚠️ Warning updating package-lock.json: ${err.message}`);
    }
  }

  // 2. Update CHANGELOG.md
  let existingChangelog = '';
  if (fs.existsSync(CHANGELOG_PATH)) {
    existingChangelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  }

  let updatedChangelog = '';
  if (existingChangelog.includes(`## [${nextVersion}]`)) {
    console.log(`ℹ️ Changelog already contains entry for [${nextVersion}], skipping duplicate.`);
    updatedChangelog = existingChangelog;
  } else if (existingChangelog.startsWith('# Changelog')) {
    updatedChangelog = existingChangelog.replace(
      /^# Changelog\s*\n+/,
      `# Changelog\n\n${changelogEntry}\n`,
    );
  } else {
    updatedChangelog = `# Changelog\n\n${changelogEntry}\n${existingChangelog}`;
  }
  fs.writeFileSync(CHANGELOG_PATH, updatedChangelog.trim() + '\n', 'utf8');
  console.log('✓ Updated CHANGELOG.md');

  // 3. Git commit and tag
  const tagName = `v${nextVersion}`;
  try {
    const gitAddFiles = ['package.json', 'CHANGELOG.md'];
    if (fs.existsSync(PKG_LOCK_PATH)) gitAddFiles.push('package-lock.json');
    runGit(`git add ${gitAddFiles.join(' ')}`, true);
    runGit(`git commit -m "chore(release): v${nextVersion} [build ${nextBuildCode}]"`, true);
    runGit(`git tag -a "${tagName}" -m "Release ${tagName}"`, true);
    console.log(`✓ Created Git tag: ${tagName}`);
  } catch (err) {
    console.warn(`⚠️ Git operations note: ${err.message}`);
  }

  console.log('\n🎉 Release process finished successfully!');
}

main();
