/**
 * Server-rendered web entry (RSC pages using the Payload Local API) — kept
 * separate from ./web so the client registry's widget imports never pull
 * payload/node modules into client chunks.
 */
export { PricingPage, pricingMetadata } from "./pricing-page";
export { CheckoutPage, checkoutMetadata } from "./checkout-page";
export {
  CheckoutReturnPage,
  checkoutReturnMetadata,
} from "./checkout-return-page";
