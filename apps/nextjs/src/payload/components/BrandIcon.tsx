/**
 * Replaces Payload's default mark in the admin chrome (the step-nav home icon
 * in the breadcrumb) with the Dream icon.
 *
 * Drawn inline at a fixed size: Payload wraps the slot in a span with no
 * height, so an <img> sized by percentage collapsed to 0×0 and the breadcrumb
 * showed nothing. The colour follows the admin's own theme toggle
 * (`[data-theme="dark"]`, see `.dream-brand-icon` in (payload)/custom.css),
 * not the OS setting the favicon follows.
 */
export function BrandIcon() {
  return (
    <svg
      className="dream-brand-icon"
      viewBox="0 0 1273 1273"
      width={18}
      height={18}
      aria-hidden
      focusable="false"
    >
      <path
        fillRule="evenodd"
        d="M0 0H636.5C988.03 0 1273 284.97 1273 636.5C1273 988.03 988.03 1273 636.5 1273H0ZM540.28 926.86 1004.85 462.29 888.71 346.14 540.28 694.57 424.14 578.43 308 694.57Z"
      />
    </svg>
  );
}
