export type InstallScope = 'project' | 'global';
export type InstallMethod = 'symlink' | 'copy';
export type InstallEnvironment = {
  cwd: string;
  homeDir: string;
  paneonHome: string;
  packageRoot: string;
  packageVersion: string;
  env: Record<string, string | undefined>;
};
export type SkillAgent = { id: string; displayName: string; universal: boolean; detected: boolean };
export type InstallRequest = { agents: string[]; scope: InstallScope; method?: InstallMethod };
export type InstallTarget = {
  path: string;
  kind: 'directory' | 'symlink';
  target?: string;
  agents: string[];
  exists: boolean;
};
export type InstallPlan = {
  scope: InstallScope;
  projectPath?: string;
  method: InstallMethod;
  agents: string[];
  paneonVersion: string;
  sourcePath: string;
  recordPath: string;
  targets: InstallTarget[];
};
export type InstallResult = {
  scope: InstallScope;
  projectPath?: string;
  method: InstallMethod;
  paneonVersion: string;
  recordPath: string;
  targets: {
    path: string;
    kind: 'directory' | 'symlink';
    target?: string;
    status: 'installed' | 'linked';
  }[];
};
export type InstallationRecord = {
  scope: InstallScope;
  projectPath?: string;
  paneonVersion: string;
  agents: string[];
  method: InstallMethod;
  targets: { path: string; kind: 'directory' | 'symlink'; target?: string }[];
};
export type InstallationRecords = { schemaVersion: 1; installations: InstallationRecord[] };
