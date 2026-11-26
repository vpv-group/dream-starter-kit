# Notifications

The kit's shared notification service. Other modules **produce**
notifications through the contract below; this module **delivers** them.

| Channel    | Today                                                  | Later (this module's build-out)                          |
| ---------- | ------------------------------------------------------ | -------------------------------------------------------- |
| `in_app`   | Feed at `/a/notifications`, header bell, native screen | —                                                        |
| `push`     | Expo push from `notify()` (TypeScript producers)       | Also for SQL producers, via a delivery worker            |
| `email`    | Stored (`payload.email`), not sent                     | Sent, with the producer's reply-to and threading headers |
| `web_push` | Stored, not sent                                       | Sent                                                     |
| `sms`      | Stored, not sent                                       | Optional                                                 |

Producers never send email or push themselves, so when a channel ships here,
every producer gets it without changes.

## Producer contract (1.1)

1. **Require the module**: `requires: ["notifications"]` in your manifest, and
   `"@acme/mod-notifications": "workspace:*"` in `package.json` for the
   TypeScript API.
2. **Register your categories** in a migration. Categories feed a future
   preferences screen:

   ```sql
   select public.mod_notifications_register_category(
     'client-portal.case.reply',        -- <module>.<thing>[.<event>]
     'client-portal',                   -- module slug
     'Replies to your tickets',         -- label
     'A support agent replied to one of your tickets.',
     'client',                          -- audience: client | staff | everyone
     array['in_app', 'push', 'email'],  -- default channels
     true                               -- transactional
   );
   ```

   In your `drop.sql`: `select public.mod_notifications_unregister_module('client-portal');`

3. **Emit notifications.**
   - **TypeScript** (server routes):

     ```ts
     import { notify } from "@acme/mod-notifications/server";

     await notify(serviceRoleClient, {
       userId,
       category: "client-portal.case.reply",
       title: "New reply on your ticket",
       body: "Ada: Thanks, we're on it.",
       url: "/a/client-portal/tickets/42",
       entity: { type: "case", id: "42" },
       actorId: staffUserId,
       dedupeKey: `case-comment:${commentId}:${userId}`,
       payload: {
         email: {
           subject: "[#00001042] Printer offline",
           text: "Ada replied…",
           replyTo: "support+c.42.sig@reply.example.com",
           headers: { messageId: "<c42-7@reply.example.com>" },
         },
       },
     });
     ```

   - **SQL** (row triggers, definer functions, Deno edge functions):

     ```sql
     perform public.mod_notifications_emit(
       _user => new_owner, _category => 'crm.case.assigned',
       _title => 'Case assigned to you', _body => new.subject,
       _url => '/a/crm/cases/' || new.id,
       _entity_type => 'case', _entity_id => new.id::text,
       _dedupe_key => 'case-assigned:' || new.id || ':' || new_owner);
     ```

### Fields

| Field       | Notes                                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `category`  | A registered key. `type` is kept as an alias for producers written before 1.1.                                                                                                                                                                                     |
| `url`       | Click-through target: an app path (`/a/…`) or an `https://` URL. Any other form is rejected.                                                                                                                                                                       |
| `entity`    | The record the notification is about (`type`, `id`).                                                                                                                                                                                                               |
| `actorId`   | The user whose action caused it.                                                                                                                                                                                                                                   |
| `channels`  | Requested channels. Omit to use the category's defaults.                                                                                                                                                                                                           |
| `payload`   | Per-channel renderings. `email`: `{ subject, text, html?, action?, replyTo?, headers? }`. `action` is `{ label, url }`, and its `url` may be an app path that the email channel resolves against the site URL. `push` / `webPush`: `{ title?, body?, threadId? }`. |
| `dedupeKey` | Stable key. A repeat for the same user is a no-op: `notify()` returns `null`, `emit` returns `null`.                                                                                                                                                               |

### Who may emit

`mod_notifications_emit` refuses a signed-in user notifying someone else
directly over the API. It accepts calls from:

- a trigger;
- system code (the service role, or a session with no JWT);
- a definer function that ran `set_config('mod_notifications.emit', 'on', true)`;
- a user notifying themself.

Producers must not let a client choose an arbitrary recipient through their
own definer functions.

## Client hooks

The client barrel exports `useNotifications`, `useUnreadCount`,
`useMarkNotificationRead`, the contract types, and `notificationHref(n)`.
`notificationHref` returns the safe click-through for a notification; it reads
`url` first, then `data.url` for older rows.

## Push on mobile

Remote push needs a dev or standalone build on a physical device. Tapping a
push opens its `url`: app paths go through the router, and `https` links open
in the browser.

A device's token is registered to the signed-in user
(`mod_notifications_register_push_token`) and removed again on sign-out:
`./native` registers a before-sign-out hook (`onBeforeSignOut` from
`@acme/api`) that `signOut()` in `@acme/app` runs while the session still
exists. It calls `mod_notifications_unregister_push_token(token)`, which
deletes only the caller's own row. The hook is best effort and time-boxed, so
it never blocks signing out.

## Push delivery and dead tokens

Scheduled staff notifications are sent by the kit's dispatch worker
(`@acme/mcp`, see docs/CMS.md → `notifications`). After each Expo batch it
stores the push ticket ids, with the token each went to, in
`mod_notifications_push_tickets`. That table is server-only: RLS is on and it
has no policies, so only the service role reaches it. The kit's
`push-receipts` job reads Expo's receipts about 15 minutes later and deletes
the tokens of devices that are no longer registered (`DeviceNotRegistered`).
It then deletes the processed tickets, and tickets older than 24 hours are
deleted unread. `notify()` doesn't record tickets yet.
