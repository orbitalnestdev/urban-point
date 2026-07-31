/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user?: {
      id: string;
      name: string;
      email: string;
      role: string;
      profileId: string;
    };
  }
}
