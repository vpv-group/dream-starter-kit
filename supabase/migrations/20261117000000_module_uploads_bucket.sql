-- Modules used to be called "extensions". The admin zip-upload
-- bucket is now `module-uploads` (private, server-only — same rules as the
-- `extension-uploads` bucket it replaces). Uploaded zips are short-lived (the
-- module-ops workflow consumes them once), so nothing is moved. Storage
-- forbids deleting buckets from SQL; remove the empty legacy
-- `extension-uploads` bucket from Studio or the Storage API if you like.
insert into storage.buckets (id, name, public)
values ('module-uploads', 'module-uploads', false)
on conflict (id) do nothing;
