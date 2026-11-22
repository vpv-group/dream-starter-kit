/**
 * Replaces Payload's wordmark (admin login, reset and "unauthorized" screens)
 * with the Dream Starter Kit logo: the colour version on light grounds and the
 * reversed one on dark, switched by the admin's `[data-theme]` (see
 * `.dream-brand-logo` in (payload)/custom.css). Files: public/brand/.
 */
export function BrandLogo() {
  return (
    <span className="dream-brand-logo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="dream-brand-logo__light"
        src="/brand/dream-starter-kit-logo-color.svg"
        alt="Dream Starter Kit"
        width={199}
        height={28}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="dream-brand-logo__dark"
        src="/brand/dream-starter-kit-logo-reversed.svg"
        alt="Dream Starter Kit"
        width={199}
        height={28}
      />
    </span>
  );
}
