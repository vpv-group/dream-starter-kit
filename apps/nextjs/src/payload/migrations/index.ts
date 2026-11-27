import * as migration_20260609_224708_initial from './20260609_224708_initial';
import * as migration_20260610_212512_full_registry from './20260610_212512_full_registry';
import * as migration_20260610_221650_globals_extensions from './20260610_221650_globals_extensions';
import * as migration_20260610_230000_repair_migration_ledger from './20260610_230000_repair_migration_ledger';
import * as migration_20260611_222956_extensions_framework from './20260611_222956_extensions_framework';
import * as migration_20260612_015425_ext_chat_settings from './20260612_015425_ext_chat_settings';
import * as migration_20260612_023534_ext_billing from './20260612_023534_ext_billing';
import * as migration_20260612_032502_drop_ext_demo from './20260612_032502_drop_ext_demo';
import * as migration_20260612_222154_add_item_tooltip from './20260612_222154_add_item_tooltip';
import * as migration_20260613_021834_ext_chat_skills_and_settings_tabs from './20260613_021834_ext_chat_skills_and_settings_tabs';
import * as migration_20260613_023123_ext_docs_initial from './20260613_023123_ext_docs_initial';
import * as migration_20260613_025126_ext_chat_adapter_slack_initial from './20260613_025126_ext_chat_adapter_slack_initial';
import * as migration_20260613_025129_ext_chat_adapter_sendblue_initial from './20260613_025129_ext_chat_adapter_sendblue_initial';
import * as migration_20260613_161650_ai_chat_adapter_settings_tabs from './20260613_161650_ai_chat_adapter_settings_tabs';
import * as migration_20260620_212733_image_generation from './20260620_212733_image_generation';
import * as migration_20260624_000100_drop_favorites from './20260624_000100_drop_favorites';
import * as migration_20260624_151421_image_audit_settings from './20260624_151421_image_audit_settings';
import * as migration_20260702_173249_authentication_settings from './20260702_173249_authentication_settings';
import * as migration_20260827_194320_legal_pages from './20260827_194320_legal_pages';
import * as migration_20260827_194500_move_legal_docs from './20260827_194500_move_legal_docs';
import * as migration_20261103_222708_payload_3_92_object_key from './20261103_222708_payload_3_92_object_key';
import * as migration_20261117_200000_rename_extensions_to_modules from './20261117_200000_rename_extensions_to_modules';
import * as migration_20261117_212656_dream_brand_theme_defaults from './20261117_212656_dream_brand_theme_defaults';
import * as migration_20261117_212755_dream_brand_serif_default from './20261117_212755_dream_brand_serif_default';
import * as migration_20261117_222758_sync_snapshot_after_module_rename from './20261117_222758_sync_snapshot_after_module_rename';
import * as migration_20261118_231216_workspaces_account_model from './20261118_231216_workspaces_account_model';
import * as migration_20261122_193348_dream_site from './20261122_193348_dream_site';
import * as migration_20261124_153215_module_settings from './20261124_153215_module_settings';
import * as migration_20261125_024658_native_navigation from './20261125_024658_native_navigation';
import * as migration_20261125_232648_jobs_tasks from './20261125_232648_jobs_tasks';
import * as migration_20261125_233209_indexes_and_counters from './20261125_233209_indexes_and_counters';
import * as migration_20261125_234244_jobs_tasks_2 from './20261125_234244_jobs_tasks_2';
import * as migration_20261126_024654_notifications_attempts_receipts from './20261126_024654_notifications_attempts_receipts';
import * as migration_20261126_040551_nav_groups from './20261126_040551_nav_groups';
import * as migration_20261126_201522_mod_feedback_initial from './20261126_201522_mod_feedback_initial';
import * as migration_20261126_203722_mod_feedback_ideas from './20261126_203722_mod_feedback_ideas';
import * as migration_20261126_211703_mod_feedback_changelog from './20261126_211703_mod_feedback_changelog';
import * as migration_20261126_213738_mod_feedback_integrations from './20261126_213738_mod_feedback_integrations';
import * as migration_20261126_215221_mod_feedback_autopilot from './20261126_215221_mod_feedback_autopilot';
import * as migration_20261126_220015_mod_feedback_source_chat_initial from './20261126_220015_mod_feedback_source_chat_initial';

export const migrations = [
  {
    up: migration_20260609_224708_initial.up,
    down: migration_20260609_224708_initial.down,
    name: '20260609_224708_initial',
  },
  {
    up: migration_20260610_212512_full_registry.up,
    down: migration_20260610_212512_full_registry.down,
    name: '20260610_212512_full_registry',
  },
  {
    up: migration_20260610_221650_globals_extensions.up,
    down: migration_20260610_221650_globals_extensions.down,
    name: '20260610_221650_globals_extensions',
  },
  {
    up: migration_20260610_230000_repair_migration_ledger.up,
    down: migration_20260610_230000_repair_migration_ledger.down,
    name: '20260610_230000_repair_migration_ledger',
  },
  {
    up: migration_20260611_222956_extensions_framework.up,
    down: migration_20260611_222956_extensions_framework.down,
    name: '20260611_222956_extensions_framework',
  },
  {
    up: migration_20260612_015425_ext_chat_settings.up,
    down: migration_20260612_015425_ext_chat_settings.down,
    name: '20260612_015425_ext_chat_settings',
  },
  {
    up: migration_20260612_023534_ext_billing.up,
    down: migration_20260612_023534_ext_billing.down,
    name: '20260612_023534_ext_billing',
  },
  {
    up: migration_20260612_032502_drop_ext_demo.up,
    down: migration_20260612_032502_drop_ext_demo.down,
    name: '20260612_032502_drop_ext_demo',
  },
  {
    up: migration_20260612_222154_add_item_tooltip.up,
    down: migration_20260612_222154_add_item_tooltip.down,
    name: '20260612_222154_add_item_tooltip',
  },
  {
    up: migration_20260613_021834_ext_chat_skills_and_settings_tabs.up,
    down: migration_20260613_021834_ext_chat_skills_and_settings_tabs.down,
    name: '20260613_021834_ext_chat_skills_and_settings_tabs',
  },
  {
    up: migration_20260613_023123_ext_docs_initial.up,
    down: migration_20260613_023123_ext_docs_initial.down,
    name: '20260613_023123_ext_docs_initial',
  },
  {
    up: migration_20260613_025126_ext_chat_adapter_slack_initial.up,
    down: migration_20260613_025126_ext_chat_adapter_slack_initial.down,
    name: '20260613_025126_ext_chat_adapter_slack_initial',
  },
  {
    up: migration_20260613_025129_ext_chat_adapter_sendblue_initial.up,
    down: migration_20260613_025129_ext_chat_adapter_sendblue_initial.down,
    name: '20260613_025129_ext_chat_adapter_sendblue_initial',
  },
  {
    up: migration_20260613_161650_ai_chat_adapter_settings_tabs.up,
    down: migration_20260613_161650_ai_chat_adapter_settings_tabs.down,
    name: '20260613_161650_ai_chat_adapter_settings_tabs',
  },
  {
    up: migration_20260620_212733_image_generation.up,
    down: migration_20260620_212733_image_generation.down,
    name: '20260620_212733_image_generation',
  },
  {
    up: migration_20260624_000100_drop_favorites.up,
    down: migration_20260624_000100_drop_favorites.down,
    name: '20260624_000100_drop_favorites',
  },
  {
    up: migration_20260624_151421_image_audit_settings.up,
    down: migration_20260624_151421_image_audit_settings.down,
    name: '20260624_151421_image_audit_settings',
  },
  {
    up: migration_20260702_173249_authentication_settings.up,
    down: migration_20260702_173249_authentication_settings.down,
    name: '20260702_173249_authentication_settings',
  },
  {
    up: migration_20260827_194320_legal_pages.up,
    down: migration_20260827_194320_legal_pages.down,
    name: '20260827_194320_legal_pages',
  },
  {
    up: migration_20260827_194500_move_legal_docs.up,
    down: migration_20260827_194500_move_legal_docs.down,
    name: '20260827_194500_move_legal_docs',
  },
  {
    up: migration_20261103_222708_payload_3_92_object_key.up,
    down: migration_20261103_222708_payload_3_92_object_key.down,
    name: '20261103_222708_payload_3_92_object_key',
  },
  {
    up: migration_20261117_200000_rename_extensions_to_modules.up,
    down: migration_20261117_200000_rename_extensions_to_modules.down,
    name: '20261117_200000_rename_extensions_to_modules',
  },
  {
    up: migration_20261117_212656_dream_brand_theme_defaults.up,
    down: migration_20261117_212656_dream_brand_theme_defaults.down,
    name: '20261117_212656_dream_brand_theme_defaults',
  },
  {
    up: migration_20261117_212755_dream_brand_serif_default.up,
    down: migration_20261117_212755_dream_brand_serif_default.down,
    name: '20261117_212755_dream_brand_serif_default',
  },
  {
    up: migration_20261117_222758_sync_snapshot_after_module_rename.up,
    down: migration_20261117_222758_sync_snapshot_after_module_rename.down,
    name: '20261117_222758_sync_snapshot_after_module_rename',
  },
  {
    up: migration_20261118_231216_workspaces_account_model.up,
    down: migration_20261118_231216_workspaces_account_model.down,
    name: '20261118_231216_workspaces_account_model',
  },
  {
    up: migration_20261122_193348_dream_site.up,
    down: migration_20261122_193348_dream_site.down,
    name: '20261122_193348_dream_site',
  },
  {
    up: migration_20261124_153215_module_settings.up,
    down: migration_20261124_153215_module_settings.down,
    name: '20261124_153215_module_settings',
  },
  {
    up: migration_20261125_024658_native_navigation.up,
    down: migration_20261125_024658_native_navigation.down,
    name: '20261125_024658_native_navigation',
  },
  {
    up: migration_20261125_232648_jobs_tasks.up,
    down: migration_20261125_232648_jobs_tasks.down,
    name: '20261125_232648_jobs_tasks',
  },
  {
    up: migration_20261125_233209_indexes_and_counters.up,
    down: migration_20261125_233209_indexes_and_counters.down,
    name: '20261125_233209_indexes_and_counters',
  },
  {
    up: migration_20261125_234244_jobs_tasks_2.up,
    down: migration_20261125_234244_jobs_tasks_2.down,
    name: '20261125_234244_jobs_tasks_2',
  },
  {
    up: migration_20261126_024654_notifications_attempts_receipts.up,
    down: migration_20261126_024654_notifications_attempts_receipts.down,
    name: '20261126_024654_notifications_attempts_receipts',
  },
  {
    up: migration_20261126_040551_nav_groups.up,
    down: migration_20261126_040551_nav_groups.down,
    name: '20261126_040551_nav_groups',
  },
  {
    up: migration_20261126_201522_mod_feedback_initial.up,
    down: migration_20261126_201522_mod_feedback_initial.down,
    name: '20261126_201522_mod_feedback_initial',
  },
  {
    up: migration_20261126_203722_mod_feedback_ideas.up,
    down: migration_20261126_203722_mod_feedback_ideas.down,
    name: '20261126_203722_mod_feedback_ideas',
  },
  {
    up: migration_20261126_211703_mod_feedback_changelog.up,
    down: migration_20261126_211703_mod_feedback_changelog.down,
    name: '20261126_211703_mod_feedback_changelog',
  },
  {
    up: migration_20261126_213738_mod_feedback_integrations.up,
    down: migration_20261126_213738_mod_feedback_integrations.down,
    name: '20261126_213738_mod_feedback_integrations',
  },
  {
    up: migration_20261126_215221_mod_feedback_autopilot.up,
    down: migration_20261126_215221_mod_feedback_autopilot.down,
    name: '20261126_215221_mod_feedback_autopilot',
  },
  {
    up: migration_20261126_220015_mod_feedback_source_chat_initial.up,
    down: migration_20261126_220015_mod_feedback_source_chat_initial.down,
    name: '20261126_220015_mod_feedback_source_chat_initial',
  },
];
