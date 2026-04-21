import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { TestSuite } from '../types.ts';

const DEFAULT_LOCATIONS = [
    'suites/default.yaml',
    'suites/suite.yaml',
    'tests/endpoints/suite.yaml',
];

export function loadTestSuite(filePath?: string): TestSuite {
    let target: string;

    if (filePath) {
        target = path.resolve(filePath);
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
                `Tidak ada test suite ditemukan. Buat file di salah satu lokasi:\n` +
                DEFAULT_LOCATIONS.map((p) => `  - ${p}`).join('\n')
            );
        }
        target = found;
        console.error(`[loader] Using suite: ${target}`);
    }

    const content = fs.readFileSync(target, 'utf-8');
    const parsed = yaml.load(content) as TestSuite;

    if (!parsed?.endpoints || !Array.isArray(parsed.endpoints)) {
        throw new Error(
            `Format suite tidak valid: ${target}\n` +
            `Pastikan ada array "endpoints" di root file YAML.`
        );
    }

    return parsed;
}