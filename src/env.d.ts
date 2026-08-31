/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare var L: any;

declare namespace App {
  interface Locals {
    user?: {
      id: string;
      name: string;
      email: string;
      role: string;
      profileId: string;
    };
    isImpersonating?: boolean;
    impersonatorAdminName?: string;
    /** Rol real de quien impersona, mientras isImpersonating es true. */
    impersonatorRole?: string;
    /** Memoiza el profile del cliente por request (ver getClientProfile). */
    __clientProfilePromise?: Promise<any> | null;
  }
}
