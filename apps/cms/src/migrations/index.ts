import * as migration_20260614_185535_initial from './20260614_185535_initial';

export const migrations = [
  {
    up: migration_20260614_185535_initial.up,
    down: migration_20260614_185535_initial.down,
    name: '20260614_185535_initial'
  },
];
