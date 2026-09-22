/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as alerts from "../alerts.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as diagnostics from "../diagnostics.js";
import type * as drill from "../drill.js";
import type * as emailSend from "../emailSend.js";
import type * as emailVerification from "../emailVerification.js";
import type * as emergency from "../emergency.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as incidents from "../incidents.js";
import type * as journeys from "../journeys.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_excerpt from "../lib/excerpt.js";
import type * as lib_idempotency from "../lib/idempotency.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_staticPages from "../lib/staticPages.js";
import type * as lib_stations from "../lib/stations.js";
import type * as lib_transit from "../lib/transit.js";
import type * as lib_validation from "../lib/validation.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_webhookAuth from "../lib/webhookAuth.js";
import type * as monitoring from "../monitoring.js";
import type * as monitoringData from "../monitoringData.js";
import type * as navigation from "../navigation.js";
import type * as ops from "../ops.js";
import type * as pools from "../pools.js";
import type * as providers_agentmail from "../providers/agentmail.js";
import type * as providers_firecrawl from "../providers/firecrawl.js";
import type * as providers_openai from "../providers/openai.js";
import type * as providers_valhalla from "../providers/valhalla.js";
import type * as reports from "../reports.js";
import type * as review from "../review.js";
import type * as routes from "../routes.js";
import type * as seed from "../seed.js";
import type * as tfl from "../tfl.js";
import type * as users from "../users.js";
import type * as watches from "../watches.js";
import type * as webhooks from "../webhooks.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  alerts: typeof alerts;
  auth: typeof auth;
  crons: typeof crons;
  diagnostics: typeof diagnostics;
  drill: typeof drill;
  emailSend: typeof emailSend;
  emailVerification: typeof emailVerification;
  emergency: typeof emergency;
  events: typeof events;
  http: typeof http;
  incidents: typeof incidents;
  journeys: typeof journeys;
  "lib/auth": typeof lib_auth;
  "lib/crypto": typeof lib_crypto;
  "lib/excerpt": typeof lib_excerpt;
  "lib/idempotency": typeof lib_idempotency;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/staticPages": typeof lib_staticPages;
  "lib/stations": typeof lib_stations;
  "lib/transit": typeof lib_transit;
  "lib/validation": typeof lib_validation;
  "lib/validators": typeof lib_validators;
  "lib/webhookAuth": typeof lib_webhookAuth;
  monitoring: typeof monitoring;
  monitoringData: typeof monitoringData;
  navigation: typeof navigation;
  ops: typeof ops;
  pools: typeof pools;
  "providers/agentmail": typeof providers_agentmail;
  "providers/firecrawl": typeof providers_firecrawl;
  "providers/openai": typeof providers_openai;
  "providers/valhalla": typeof providers_valhalla;
  reports: typeof reports;
  review: typeof review;
  routes: typeof routes;
  seed: typeof seed;
  tfl: typeof tfl;
  users: typeof users;
  watches: typeof watches;
  webhooks: typeof webhooks;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/core/_generated/component.js").ComponentApi<"auth">;
  authPasswordProvider: import("@convex-dev/auth/providers/password/_generated/component.js").ComponentApi<"authPasswordProvider">;
  authUsername: import("@convex-dev/auth/username/_generated/component.js").ComponentApi<"authUsername">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  extractionPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"extractionPool">;
  deliveryPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"deliveryPool">;
};
