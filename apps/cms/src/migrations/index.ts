import * as migration_20260614_185535_initial from './20260614_185535_initial';
import * as migration_20260729_182023_drop_legacy_service_collection from './20260729_182023_drop_legacy_service_collection';
import * as migration_20260729_182235_create_service_catalogue_collections from './20260729_182235_create_service_catalogue_collections';
import * as migration_20260729_201902_add_mcp_api_keys from './20260729_201902_add_mcp_api_keys';

export const migrations = [
  {
    up: migration_20260614_185535_initial.up,
    down: migration_20260614_185535_initial.down,
    name: '20260614_185535_initial',
  },
  {
    up: migration_20260729_182023_drop_legacy_service_collection.up,
    down: migration_20260729_182023_drop_legacy_service_collection.down,
    name: '20260729_182023_drop_legacy_service_collection',
  },
  {
    up: migration_20260729_182235_create_service_catalogue_collections.up,
    down: migration_20260729_182235_create_service_catalogue_collections.down,
    name: '20260729_182235_create_service_catalogue_collections',
  },
  {
    up: migration_20260729_201902_add_mcp_api_keys.up,
    down: migration_20260729_201902_add_mcp_api_keys.down,
    name: '20260729_201902_add_mcp_api_keys'
  },
];
