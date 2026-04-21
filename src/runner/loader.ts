import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { TestSuite } from '../types.ts';

const DEFAULT_LOCATIONS = [
    'suites/default.yaml',
    'suites/suite.yaml',
    'tests/endpoints/suite.yaml',
];

interface LoadOptions {
    suite_file?: string;
    suite_dir?: string;
}

/**
 * Load test suite(s).
 * Priority: suite_dir > suite_file > DEFAULT_LOCATIONS
 *
 * - suite_dir: scans directory for all .yaml/.yml files and merges them
 * - suite_file: loads a single YAML file
 * - fallback: tries DEFAULT_LOCATIONS
 */
export function loadTestSuite(filePathOrOpts?: string | LoadOptions): TestSuite {
    // Normalize input
    let suiteFile: string | undefined;
    let suiteDir: string | undefined;

    if (typeof filePathOrOpts === 'string') {
        suiteFile = filePathOrOpts;
    } else if (filePathOrOpts) {
        suiteFile = filePathOrOpts.suite_file;
        suiteDir = filePathOrOpts.suite_dir;
    }

    // ── Option 1: Load all suites from a directory ────────────────────────
    if (suiteDir) {
        const dirPath = path.resolve(suiteDir);
        if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
            throw new Error(
                `Suite directory tidak ditemukan atau bukan directory: ${dirPath}\n` +
                `Pastikan path mengarah ke folder yang berisi file .yaml/.yml.`
            );
        }

        const yamlFiles = fs.readdirSync(dirPath)
            .filter((f) => /\.ya?ml$/i.test(f))
            .sort()
            .map((f) => path.join(dirPath, f));

        if (yamlFiles.length === 0) {
            throw new Error(
                `Tidak ada file .yaml/.yml ditemukan di directory: ${dirPath}\n` +
                `Tambahkan file test suite ke folder ini.`
            );
        }

        console.error(`[loader] Loading ${yamlFiles.length} suite file(s) from: ${dirPath}`);
        return mergeSuiteFiles(yamlFiles);
    }

    // ── Option 2: Load a single file ─────────────────────────────────────
    let target: string;

    if (suiteFile) {
        target = path.resolve(suiteFile);
        if (!fs.existsSync(target)) {
            throw new Error(
                `Test suite file not found: ${target}\n` +
                `Buat file suite di folder suites/ atau gunakan path yang benar.`
            );
        }
    } else {
        const found = DEFAULT_LOCATIONS.map((p) => path.resolve(p)).find((p) => fs.existsSync(p));
        if (!found) {
            throw new Error(
                `Tidak ada test suite ditemukan. Buat file di salah satu ` + path.resolve() + ` lokasi:\n` +
                DEFAULT_LOCATIONS.map((p) => `  - ${p}`).join('\n')
            );
        }
        target = found;
        console.error(`[loader] Using suite: ${target}`);
    }

    return parseSingleSuite(target);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseSingleSuite(filePath: string): TestSuite {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(content) as TestSuite;

    if (!parsed?.endpoints || !Array.isArray(parsed.endpoints)) {
        throw new Error(
            `Format suite tidak valid: ${filePath}\n` +
            `Pastikan ada array "endpoints" di root file YAML.`
        );
    }

    return parsed;
}

function mergeSuiteFiles(files: string[]): TestSuite {
    const merged: TestSuite = { endpoints: [] };

    for (const file of files) {
        console.error(`  [loader] Loading: ${path.basename(file)}`);
        const suite = parseSingleSuite(file);

        // Use baseUrl from first suite that defines one
        if (!merged.baseUrl && suite.baseUrl) {
            merged.baseUrl = suite.baseUrl;
        }

        merged.endpoints.push(...suite.endpoints);
    }

    console.error(`[loader] Merged total: ${merged.endpoints.length} endpoints from ${files.length} file(s)`);
    return merged;
}