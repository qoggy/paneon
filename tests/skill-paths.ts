import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_ROOT = fileURLToPath(new URL('.', import.meta.resolve('#test-skill/SKILL.md')));
export const SKILL_NAME = basename(SKILL_ROOT);
export const SKILL_PACKAGE_PATH = `skills/${SKILL_NAME}`;
