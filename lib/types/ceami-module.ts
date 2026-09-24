export const CEAMI_MODULE_KEYS = [
  'members',
  'social',
  'events',
  'services',
  'welcome',
  'courses',
] as const;

export type CeamiModuleKey = (typeof CEAMI_MODULE_KEYS)[number];
export type CeamiModuleAccessLevel = 'viewer' | 'manager';

export type CeamiModuleAccess = {
  moduleKey: CeamiModuleKey;
  accessLevel: CeamiModuleAccessLevel;
};

export const CEAMI_MODULE_PATHS: Record<CeamiModuleKey, string> = {
  members: '/membros',
  social: '/social',
  events: '/eventos',
  services: '/servicos',
  welcome: '/acolhimentos',
  courses: '/cursos',
};

export function isCeamiModuleKey(value: unknown): value is CeamiModuleKey {
  return typeof value === 'string' && CEAMI_MODULE_KEYS.includes(value as CeamiModuleKey);
}
