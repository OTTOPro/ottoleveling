// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      /** Cloudflare Access JWT extracted from the CF_Authorization cookie. */
      accessJwt: string | null;
    }
    interface PageData {
      /** Access JWT forwarded from root +layout.server.ts. */
      accessJwt?: string | null;
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
